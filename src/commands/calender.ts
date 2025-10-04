// src/commands/calender.ts
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, CacheType, MessageFlags } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDayHeader(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function eventLink(ev: any, guildId: string) {
  if (ev.threadId) {
    return `https://discord.com/channels/${guildId}/${ev.threadId}`;
  }
  if (ev.channelId && ev.messageId) {
    return `https://discord.com/channels/${guildId}/${ev.channelId}/${ev.messageId}`;
  }
  return null;
}

/**
 * Event line format:
 * "<@hostId> <t:unix:t> [**Title**](link) <t:unix:R> • 5/30 _(TYPE · SUBTYPE · SCOPE)_"
 */
function formatEventLine(
  ev: any,
  guildId: string,
  signupCount: number
) {
  const dt = new Date(ev.startTime);
  const unix = Math.floor(dt.getTime() / 1000);

  const bits: string[] = [];
  if (ev.type) bits.push(ev.type.toUpperCase());
  if (ev.subtype) bits.push(ev.subtype.toUpperCase());
  if (ev.scope) bits.push(ev.scope);

  const link = eventLink(ev, guildId);
  const title = link ? `[**${ev.title}**](${link})` : `**${ev.title}**`;

  const capTotal = ev.capacityCap ?? 0;
  const capBadge = ` ${signupCount}/${capTotal > 0 ? capTotal : '∞'}`;

  // host mention brings in avatar+username hover card
  return `> <t:${unix}:t> ${title} <t:${unix}:R> •${capBadge}`;
}

function chunkString(str: string, size = 1024): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < str.length) {
    chunks.push(str.slice(i, i + size));
    i += size;
  }
  return chunks;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('calender')
    .setDescription('Show all upcoming events grouped by day (host + time + linked title + relative time + capacity)'),

  async execute(interaction: ChatInputCommandInteraction<CacheType>) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server!', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const now = new Date();

      const events = await prisma.event.findMany({
        where: {
          guildId: interaction.guildId,
          startTime: { gte: now },
          //published: true,
        },
        orderBy: { startTime: 'asc' },
        include: {
          _count: { select: { signups: true } },
        },
      });

      if (events.length === 0) {
        await interaction.reply('ℹ️ No upcoming events.');
        return;
      }

      const groups = new Map<string, { date: Date; lines: string[] }>();
      for (const ev of events) {
        const dt = new Date(ev.startTime);
        const key = ymd(dt);
        // @ts-ignore
        const signupCount: number = ev._count?.signups ?? 0;
        const line = formatEventLine(ev, interaction.guildId, signupCount);

        if (!groups.has(key)) {
          groups.set(key, { date: dt, lines: [line] });
        } else {
          groups.get(key)!.lines.push(line);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('📅 Upcoming Events')
        .setColor(0x5865F2);

      const sorted = [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

      let fieldsUsed = 0;
      const MAX_FIELDS = 25;

      for (const group of sorted) {
        const header = formatDayHeader(group.date);
        const value = group.lines.join('\n');

        const chunks = value.length <= 1024 ? [value] : chunkString(value, 1024);

        for (let i = 0; i < chunks.length; i++) {
          if (fieldsUsed >= MAX_FIELDS) break;
          embed.addFields({
            name: i === 0 ? header : `${header} (cont. ${i + 1})`,
            value: chunks[i],
          });
          fieldsUsed++;
        }

        if (fieldsUsed >= MAX_FIELDS) break;
      }

      if (fieldsUsed >= MAX_FIELDS) {
        embed.setFooter({ text: 'Showing first 25 day sections. Refine or limit results to see more.' });
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching events:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ An error occurred while fetching events. Please try again.', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: '❌ An error occurred while fetching events. Please try again.', flags: MessageFlags.Ephemeral });
      }
    }
  },
};
