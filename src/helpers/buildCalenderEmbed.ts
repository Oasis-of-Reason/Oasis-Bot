import {
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	MessageFlagsBitField,
	ButtonStyle,
} from "discord.js";
import { emojiMapTypes } from "./generalConstants";

export function buildCalenderContainer(
	events: any[],
	guildId: string,
	ephemeral = false,
	myEventsOnly = false,
	chunkIndex: number = 0
) {
	// Group events by YYYY-MM-DD plus a special "ongoing" bucket
	const groups = new Map<string, { date: Date; lines: string[] }>();
	const ongoingLines: string[] = [];

	for (const ev of events) {
		const dt = new Date(ev.startTime);
		const signupCount: number = ev._count?.signups ?? 0;

		const isOngoing = isEventOngoing(ev);
		const line = formatEventLine(ev, guildId, signupCount, isOngoing);

		if (isOngoing) {
			ongoingLines.push(line);
			continue;
		}

		const key = ymd(dt);
		const g = groups.get(key);
		if (g) g.lines.push(line);
		else groups.set(key, { date: dt, lines: [line] });
	}

	// Sort by day
	const sorted = [...groups.values()].sort(
		(a, b) => a.date.getTime() - b.date.getTime()
	);

	// Build a Container with TextDisplays
	const container = new ContainerBuilder().setAccentColor(
		myEventsOnly ? 0xb865f2 : chunkIndex % 2 === 0 ? 0x5658ff : 0xa3b9ff
	);

	if (chunkIndex === 0) {
		if (ephemeral) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					myEventsOnly ? "### 📅 My Events" : "### 📅 Upcoming Events"
				)
			);
		} else {
			container.addSectionComponents((section) =>
				section
					.addTextDisplayComponents((textDisplay) =>
						textDisplay.setContent("### 📅  Upcoming Events")
					)
					.setButtonAccessory((button) =>
						button
							.setCustomId(`calendar:listmyEvents:${guildId}`)
							.setLabel("My Events")
							.setStyle(ButtonStyle.Primary)
					)
			);
		}
		container.addSeparatorComponents(new SeparatorBuilder());
	}

	// --- Ongoing section first (if any) ---
	if (ongoingLines.length > 0) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent("**Ongoing**")
		);

		const body = ongoingLines.join("\n");
		const chunks = chunkString(body, 1800);

		for (const chunk of chunks) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(chunk || "\u200B")
			);
		}

		container.addSeparatorComponents(new SeparatorBuilder());
	}

	// --- Normal per-day sections ---
	for (const group of sorted) {
		const header = `**${formatDayHeader(group.date)}**`;
		const body = group.lines.join("\n");

		const chunks = chunkString(body, 1800);

		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));

		for (const chunk of chunks) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(chunk || "\u200B")
			);
		}
	}

	// Return a message payload that you can send/edit
	if (ephemeral) {
		return {
			components: [container.toJSON()],
			flags:
				MessageFlagsBitField.resolve(MessageFlagsBitField.Flags.IsComponentsV2) |
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
	// NOTE: your schema uses publishedThreadId, not publishedThreadID
	if (ev.publishedChannelId && ev.publishedChannelMessageId) {
		return `https://discord.com/channels/${guildId}/${ev.publishedChannelId}/${ev.publishedChannelMessageId}`;
	}
	if (ev.publishedThreadId) {
		return `https://discord.com/channels/${guildId}/${ev.publishedThreadId}`;
	}
	return null;
}

function formatEventLine(ev: any, guildId: string, signupCount: number, isOngoing: boolean) {
	const dt = new Date(ev.startTime);
	const unix = Math.floor(dt.getTime() / 1000);

	const draftText = ev.published ? "" : " • (Draft)";
	const newText = ev.publishedAt ? (isWithinLastDay(new Date(ev.publishedAt)) ? "**NEW** •" : "") : "";

	const link = eventLink(ev, guildId);
	const title = link ? `[**${ev.title}**](${link})` : `**${ev.title}**`;

	const capTotal = ev.capacityCap ?? 0;
	const hasCap = (ev.capacityCap ?? 0) + (ev.capacityBase ?? 0) > 0;
	const capBadge = hasCap ? `${signupCount}/${capTotal}` : `${signupCount}`;

	const typeEmoji =
		ev.type === "VRCHAT"
			? emojiMapTypes["VRCHAT"].emoji
			: emojiMapTypes["DISCORD"].emoji;

	// Ongoing events: replace the first timestamp with a green dot 🟢
	const leftPrefix = isOngoing ? "🟢" : `<t:${unix}:t>`;

	return `> ${leftPrefix} ${typeEmoji} ${newText} ${title} <t:${unix}:R> • (${capBadge})${draftText}`;
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

/**
 * Treat an event as "ongoing" if now is between startTime and (startTime + lengthMinutes).
 * If lengthMinutes is missing/0, we treat it as not ongoing.
 */
function isEventOngoing(ev: any): boolean {
	const lengthMinutes = Number(ev.lengthMinutes ?? 0);
	if (!Number.isFinite(lengthMinutes) || lengthMinutes <= 0) return false;

	const start = new Date(ev.startTime).getTime();
	const end = start + lengthMinutes * 60 * 1000;
	const now = Date.now();

	return now >= start && now < end;
}
