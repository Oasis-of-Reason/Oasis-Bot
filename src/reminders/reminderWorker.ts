import {
	Client,
	EmbedBuilder
} from 'discord.js';
import {
	PrismaClient,
	NotificationType
} from '@prisma/client';
import { giveCookies } from '../helpers/cookieHelpers';

const prisma = new PrismaClient();

const LOOKAHEAD_HOURS = 24;
const WINDOW_MINUTES = 2;     // tolerance for scheduler drift
const PACE_MS = 350;          // gentle pacing between DMs

export function startReminderWorker(client: Client) {
	void runOnce(client).catch(console.error);
	setInterval(() => void runOnce(client).catch(console.error), 30_000);
}

async function runOnce(client: Client) {
	const now = new Date();
	const windowMinutesAgo = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);
	const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

	// 1) Get upcoming published events
	const events = await prisma.event.findMany({
		where: {
			published: true,
			startTime: { gt: windowMinutesAgo, lte: horizon },
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
		const deltaMinutes = (startMs - nowMs) / 60000.0;
		const unix = Math.floor(startMs / 1000);


		const event = await prisma.event.findUnique({
			where: { id: ev.id },
			include: { signups: { select: { userId: true } } },
		});
		const userIds = (event?.signups.map(s => s.userId) ?? []).concat([ev.hostId]);

		for (const uid of userIds) {
			const prefs = userPrefs.get(uid) ?? {
				reminderMinutesBefore: 30,
				reminderNotifications: true,
				eventStartingNotifications: true,
			};

			// --- A) Pre-reminder (user-specific offset) ---
			if (prefs.reminderNotifications && prefs.reminderMinutesBefore > 0) {
				const pref = prefs.reminderMinutesBefore;
				if (deltaMinutes >= pref - WINDOW_MINUTES && deltaMinutes <= pref) {
					const key = `${uid}:${ev.id}:REMINDER`;
					if (!sentKey.has(key)) {
						const ok = await sendReminderDM(client, uid, ev, unix, 'REMINDER');
						if (ok) {
							sentKey.add(key);
						}
						await sleep(PACE_MS);
					}
				}
			}

			// --- B) Event is starting now ---
			if (prefs.eventStartingNotifications) {
				if (deltaMinutes >= (-WINDOW_MINUTES) && deltaMinutes <= 0) {
					const key = `${uid}:${ev.id}:START`;
					if (!sentKey.has(key)) {
						const ok = await sendReminderDM(client, uid, ev, unix, 'START');
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
	ev: { id: number; hostId: string, signups: any[], title: string; startTime: Date; guildId: string; publishedThreadId: string | null; publishedChannelId: string | null; publishedChannelMessageId: string | null; },
	unix: number,
	type: 'REMINDER' | 'START',
): Promise<boolean> {
	try {
		const user = await client.users.fetch(userId);
		const isReminder = type === 'REMINDER';
		const whenFull = `<t:${unix}:F>`;
		const whenRel = `<t:${unix}:R>`;
		const joinLink =
			ev.publishedThreadId
				? `https://discord.com/channels/${ev.guildId}/${ev.publishedThreadId}`
				: (ev.publishedChannelId && ev.publishedChannelMessageId)
					? `https://discord.com/channels/${ev.guildId}/${ev.publishedChannelId}/${ev.publishedChannelMessageId}`
					: '';

		const isHost = (userId === ev.hostId);
		let cookieAmount = 1;
		if (!isReminder) {
			cookieAmount = isHost ? 2 + ev.signups.length : cookieAmount
			await giveCookies(ev.guildId, userId, cookieAmount);
		}

		const embed = new EmbedBuilder()
			.setTitle(isReminder ? '⏰ Event Reminder' : `🚀 Event Starting!`)
			.setColor(isReminder ? 0xFF9D00 : 0x00FF13);
		const header =
			isReminder
				? `**${ev.title}** is starting soon!`
				: `**${ev.title}** is starting now!`;

		const content =
			`${header}\n\n` +
				`Start time: ${whenFull} (${whenRel})\n\n` +
				(joinLink ? `${joinLink}\n` : '') +
				(isReminder ? '' : (isHost ? `\n You have been awarded ${cookieAmount} Cookies for hosting! 🍪` : `\n You have been awarded 1 Cookie for attending! 🍪`));

		embed.addFields({
			name: "",
			value: content,
			inline: true,
		});

		await user.send({ embeds: [embed], allowedMentions: { parse: [] } });

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
