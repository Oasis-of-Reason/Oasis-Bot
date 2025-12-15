// buildCalendarContainer.ts
import {
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	MessageFlags,
	MessageFlagsBitField,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";
import { emojiMapTypes } from "./generalConstants";

export function buildCalenderContainer(events: any[], guildId: string, ephemeral = false, myEventsOnly = false, chunkIndex: number = 0) {
	// Group events by YYYY-MM-DD
	const groups = new Map<string, { date: Date; lines: string[] }>();

	for (const ev of events) {
		const dt = new Date(ev.startTime);
		const key = ymd(dt);
		const signupCount: number = ev._count?.signups ?? 0;
		const line = formatEventLine(ev, guildId, signupCount);

		const g = groups.get(key);
		if (g) g.lines.push(line);
		else groups.set(key, { date: dt, lines: [line] });
	}

	// Sort by day
	const sorted = [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

	// Build a Container with TextDisplays
	const container = new ContainerBuilder().setAccentColor(myEventsOnly ? 0xb865f2 : (chunkIndex % 2 == 0 ? 0x5658ff : 0xa3b9ff));

	if (chunkIndex == 0) {
		if (ephemeral) {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(myEventsOnly ? '### 📅 My Events' : '### 📅 Upcoming Events'));
		} else {
			container.addSectionComponents((section) =>
				section
					.addTextDisplayComponents((textDisplay) =>
						textDisplay.setContent('### 📅  Upcoming Events')
					)
					.setButtonAccessory((button) =>
						button
							.setCustomId(`calendar:listmyEvents:${guildId}`) // handle this in interactionCreate
							.setLabel("My Events")
							.setStyle(ButtonStyle.Primary)
					)
			);
		}
		container.addSeparatorComponents(new SeparatorBuilder());
	}
	for (const group of sorted) {
		const header = `**${formatDayHeader(group.date)}**`;
		const body = group.lines.join("\n");

		// TextDisplay has a content length limit; chunk if needed
		const chunks = chunkString(body, 1800); // stay under 2k w/ header & margin

		// header as its own TextDisplay for readability
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));

		for (const chunk of chunks) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(chunk || "\u200B"),
			);
		}
	}

	// Return a message payload that you can send/edit
	if (ephemeral) {
		return {
			components: [container.toJSON()],
			flags: MessageFlagsBitField.resolve(MessageFlagsBitField.Flags.IsComponentsV2) |
				MessageFlagsBitField.Flags.Ephemeral,
		};
	}
	return {
		components: [container.toJSON()],
		flags: MessageFlagsBitField.resolve(MessageFlagsBitField.Flags.IsComponentsV2),
	};
}

// ----------------- helpers -----------------

function ymd(date: Date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function formatDayHeader(date: Date) {
	return date.toLocaleDateString(undefined, {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function eventLink(ev: any, guildId: string) {
	if (ev.publishedThreadID) {
		return `https://discord.com/channels/${guildId}/${ev.publishedThreadID}`;
	}
	if (ev.publishedChannelId && ev.publishedChannelMessageId) {
		return `https://discord.com/channels/${guildId}/${ev.publishedChannelId}/${ev.publishedChannelMessageId}`;
	}
	return null;
}

function formatEventLine(ev: any, guildId: string, signupCount: number) {
	const dt = new Date(ev.startTime);
	const unix = Math.floor(dt.getTime() / 1000);
	const draftText = ev.published ? "" : " • (Draft)";
	const newText = ev.publishedAt ? isWithinLastDay(ev.publishedAt) ? "**NEW** •" : "" : "";

	const link = eventLink(ev, guildId);
	const title = link ? `[**${ev.title}**](${link})` : `**${ev.title}**`;

	const capTotal = ev.capacityCap ?? 0;
	const hasCap = (ev.capacityCap ?? 0) + (ev.capacityBase ?? 0) > 0;
	const capBadge = hasCap ? `${signupCount}/${capTotal}` : `${signupCount}`;

	const typeEmoji =
		ev.type?.toLowerCase() === "vrc"
			? emojiMapTypes["vrchat"].emoji
			: emojiMapTypes["discord"].emoji;

	// markdown inside TextDisplay
	return `> <t:${unix}:t> ${typeEmoji} ${newText} ${title} <t:${unix}:R> • (${capBadge})${draftText}`;
}

function chunkString(str: string, size = 1800): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < str.length; i += size) chunks.push(str.slice(i, i + size));
	return chunks;
}

function isWithinLastDay(date: Date): boolean {
	const ONE_DAY_MS = 24 * 60 * 60 * 1000;
	return Date.now() - date.getTime() <= ONE_DAY_MS;
}