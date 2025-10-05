// src/reminders/user-pref-and-start-reminders.ts
import { Client } from 'discord.js';
import { PrismaClient, NotificationType } from '@prisma/client';

const prisma = new PrismaClient();

const LOOKAHEAD_HOURS = 24;
const WINDOW_MINUTES = 2;     // tolerance for scheduler drift
const PACE_MS = 350;          // gentle pacing between DMs

export function startReminderWorker(client: Client) {
  void runOnce(client).catch(console.error);
  setInterval(() => void runOnce(client).catch(console.error), 60_000);
}

async function runOnce(client: Client) {
  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

  // 1) Get upcoming published events
  const events = await prisma.event.findMany({
    where: {
      published: true,
      startTime: { gt: now, lte: horizon },
    },
    include: {
      signups: true, // must include userId
    },
    orderBy: { startTime: 'asc' },
  });
  if (events.length === 0) return;

  // 2) Gather unique user IDs from signups
  const userIds = Array.from(new Set(events.flatMap(e => e.signups.map(s => s.userId))));

  // 3) Load user prefs (defaults if missing)
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userPrefs = new Map<string, {
    reminderMinutesBefore: number;
    reminderNotifications: boolean;
    eventStartingNotifications: boolean;
  }>();

  for (const u of users) {
    userPrefs.set(u.id, {
      reminderMinutesBefore: u.reminderMinutesBefore,
      reminderNotifications: u.reminderNotifications,
      eventStartingNotifications: u.eventStartingNotifications,
    });
  }

  // 4) Preload already-sent notifications to avoid N+1 queries
  const eventIds = events.map(e => e.id);
  const sentRows = await prisma.userEventReminder.findMany({
    where: { eventId: { in: eventIds } },
    select: { userId: true, eventId: true, notificationType: true },
  });
  const sentKey = new Set(sentRows.map(r => `${r.userId}:${r.eventId}:${r.notificationType}`));

  // 5) Iterate events & signups
  const nowMs = now.getTime();

  for (const ev of events) {
    const startMs = new Date(ev.startTime).getTime();
    const deltaMin = Math.floor((startMs - nowMs) / 60000);
    const unix = Math.floor(startMs / 1000);

    for (const s of ev.signups) {
      const uid = s.userId;
      const prefs = userPrefs.get(uid) ?? {
        reminderMinutesBefore: 30,
        reminderNotifications: true,
        eventStartingNotifications: true,
      };

      // --- A) Pre-reminder (user-specific offset) ---
      if (prefs.reminderNotifications && prefs.reminderMinutesBefore > 0) {
        const pref = prefs.reminderMinutesBefore;
        if (deltaMin >= pref && deltaMin <= pref + WINDOW_MINUTES) {
          const key = `${uid}:${ev.id}:REMINDER`;
          if (!sentKey.has(key)) {
            const ok = await sendReminderDM(client, uid, ev, unix, pref, 'REMINDER');
            if (ok) {
              sentKey.add(key);
            }
            await sleep(PACE_MS);
          }
        }
      }

      // --- B) Event is starting now (global) ---
      if (prefs.eventStartingNotifications) {
        if (deltaMin >= 0 && deltaMin <= WINDOW_MINUTES) {
          const key = `${uid}:${ev.id}:START`;
          if (!sentKey.has(key)) {
            const ok = await sendReminderDM(client, uid, ev, unix, 0, 'START');
            if (ok) {
              sentKey.add(key);
            }
            await sleep(PACE_MS);
          }
        }
      }
    }
  }
}

async function sendReminderDM(
  client: Client,
  userId: string,
  ev: { id: number; title: string; startTime: Date; guildId: string; publishedThreadId: string | null; publishedChannelId: string | null; publishedChannelMessageId: string | null; },
  unix: number,
  prefMinutes: number,
  type: 'REMINDER' | 'START',
): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId);

    const whenFull = `<t:${unix}:F>`;
    const whenRel = `<t:${unix}:R>`;
    const joinLink =
      ev.publishedThreadId
        ? `Join thread: https://discord.com/channels/${ev.guildId}/${ev.publishedThreadId}`
        : (ev.publishedChannelId && ev.publishedChannelMessageId)
          ? `Message: https://discord.com/channels/${ev.guildId}/${ev.publishedChannelId}/${ev.publishedChannelMessageId}`
          : '';

    const header =
      type === 'START'
        ? `🚀 **${ev.title}** is starting now!`
        : `⏰ Reminder: **${ev.title}** starts in ${prefMinutes} minute${prefMinutes === 1 ? '' : 's'}`;

    const content =
      `${header}\n` +
      `Start time: ${whenFull} (${whenRel})\n` +
      (joinLink ? `${joinLink}\n` : '');

    await user.send({ content, allowedMentions: { parse: [] } });

    // record success
    await prisma.userEventReminder.create({
      data: {
        userId,
        eventId: ev.id,
        notificationType: type as NotificationType,
      },
    });

    return true;
  } catch {
    // DM failed (blocked/closed DMs/no mutual); do not record success
    return false;
  }
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}
