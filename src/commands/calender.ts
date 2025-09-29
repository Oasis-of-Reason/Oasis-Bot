import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function ymd(date: Date) {
	// YYYY-MM-DD to use as a stable grouping key
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function formatDayHeader(date: Date) {
	// Pretty day header, e.g. "Mon, 30 Sep 2025"
	return date.toLocaleDateString(undefined, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('calender')
		.setDescription('Show all upcoming events grouped by day (name + relative start time)'),

	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
			return;
		}

		try {
			const now = new Date();

			const events = await prisma.event.findMany({
				where: { startTime: { gte: now } },   // upcoming only
				orderBy: { startTime: 'asc' }         // chronological
			});

			if (events.length === 0) {
				await interaction.reply('ℹ️ No upcoming events.');
				return;
			}

			// Group events by day
			const groups = new Map<string, { date: Date; lines: string[] }>();
			for (const ev of events) {
				const dt = new Date(ev.startTime);
				const key = ymd(dt);
				const unix = Math.floor(dt.getTime() / 1000);
				const line = `• **${ev.title}** — <t:${unix}:R>`; // name + relative time

				if (!groups.has(key)) {
					groups.set(key, { date: dt, lines: [line] });
				} else {
					groups.get(key)!.lines.push(line);
				}
			}

			// Build embed with one field per day
			const embed = new EmbedBuilder()
				.setTitle('📅 Upcoming Events')
				.setColor(0x5865F2); // Discord blurple

			// Sort by day ascending
			const sorted = [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

			for (const group of sorted) {
				const header = formatDayHeader(group.date);
				const value = group.lines.join('\n');

				// Discord embed field limit is 1024 chars; if it’s longer, chunk it
				if (value.length <= 1024) {
					embed.addFields({ name: header, value });
				} else {
					// Chunk long days into multiple fields to stay within limits
					let remaining = value;
					let i = 1;
					while (remaining.length > 0) {
						const chunk = remaining.slice(0, 1024);
						embed.addFields({
							name: i === 1 ? header : `${header} (cont. ${i})`,
							value: chunk
						});
						remaining = remaining.slice(1024);
						i++;
					}
				}
			}

			await interaction.reply({ embeds: [embed] }); // public to channel
		} catch (error) {
			console.error('Error fetching events:', error);
			await interaction.reply({ content: '❌ An error occurred while fetching events. Please try again.', ephemeral: true });
		}
	},
};
