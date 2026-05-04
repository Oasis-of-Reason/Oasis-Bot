import {
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	MessageFlagsBitField,
	ButtonStyle,
} from "discord.js";
import { emojiMapTypes, EVENT_SUBTYPE_META } from "./generalConstants";

export function buildCalenderContainer(
	events: any[],
	guildId: string,
	ephemeral = false,
	myEventsOnly = false,
	silent = true,
) {
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

	const sorted = [...groups.values()].sort(
		(a, b) => a.date.getTime() - b.date.getTime()
	);

	// ---- GROUP BY WEEK (lightweight) ----
	function getWeekKey(date: Date) {
		const { year, week } = getISOWeek(date);
		return `${year}-W${week}`;
	}

	const weeks = new Map<
		string,
		{ label: string; days: { date: Date; lines: string[] }[] }
	>();

	for (const g of sorted) {
		const key = getWeekKey(g.date);
		if (!weeks.has(key)) {
			const { week } = getISOWeek(g.date);
			weeks.set(key, {
				label: `__**Week ${week}**__`,
				days: [],
			});
		}
		weeks.get(key)!.days.push(g);
	}

	const weekList = [...weeks.values()];

	// ---- BUILD CONTAINERS ----
	const containers: any[] = [];

	// =========================
	// HEADER CONTAINER
	// =========================
	const headerContainer = new ContainerBuilder().setAccentColor(
		myEventsOnly ? 0xb865f2 : 0x5658ff
	);

	if (ephemeral) {
		headerContainer.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				myEventsOnly ? "# 📅 My Events" : "# 📅 Scheduled Events"
			)
		);
	} else {
		headerContainer.addSectionComponents((section) =>
			section
				.addTextDisplayComponents((text) =>
					text.setContent("# 📅 Scheduled Events")
				)
				.setButtonAccessory((button) =>
					button
						.setCustomId(`calendar:listmyEvents:${guildId}`)
						.setLabel("My Events")
						.setStyle(ButtonStyle.Primary)
				)
		);
	}

	headerContainer.addSeparatorComponents(new SeparatorBuilder());

	// ---- ONGOING CASE ----
	if (ongoingLines.length > 0) {
		headerContainer.addTextDisplayComponents(
			new TextDisplayBuilder().setContent("## Ongoing")
		);

		for (const chunk of chunkString(ongoingLines.join("\n"), 1800)) {
			headerContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(chunk || "\u200B")
			);
		}

		containers.push(headerContainer);

		// remaining weeks go to new containers
	} else {
		// ---- NO ONGOING → INCLUDE FIRST WEEK + FIRST DAY ----
		if (weekList.length > 0) {
			const firstWeek = weekList[0];
			const firstDay = firstWeek.days[0];

			headerContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(firstWeek.label)
			);

			headerContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`**${formatDayHeader(firstDay.date)}**`
				)
			);

			for (const chunk of chunkString(firstDay.lines.join("\n"), 1800)) {
				headerContainer.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(chunk || "\u200B")
				);
			}

			// remove that day from future rendering
			firstWeek.days.shift();
			if (firstWeek.days.length === 0) {
				weekList.shift();
			}
		}

		containers.push(headerContainer);
	}

	// =========================
	// REMAINING CONTENT
	// =========================
	for (let i = 0; i < weekList.length; i++) {
		const container = new ContainerBuilder().setAccentColor(
			myEventsOnly
				? 0xb865f2
				: i % 2 === 0
					? 0xa3b9ff
					: 0x5658ff
		);

		const week = weekList[i];

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(week.label)
		);

		for (const day of week.days) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`**${formatDayHeader(day.date)}**`
				)
			);

			for (const chunk of chunkString(day.lines.join("\n"), 1800)) {
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(chunk || "\u200B")
				);
			}
		}

		containers.push(container);
	}

	// =========================
	// FINAL PAYLOAD SPLITTING
	// =========================
	const allContainers = containers.map((c) => c.toJSON());
	const baseFlags = MessageFlagsBitField.resolve(
		MessageFlagsBitField.Flags.IsComponentsV2 |
		(ephemeral ? MessageFlagsBitField.Flags.Ephemeral : 0) |
		(silent ? MessageFlagsBitField.Flags.SuppressNotifications : 0)
	);
	const maxLen = 4000;
	const payloads: any[] = [];
	let current: any = { components: [], flags: baseFlags };
	for (const cont of allContainers) {
		// Try adding this container to the current payload
		const testPayload = { ...current, components: [...current.components, cont] };
		const testLen = JSON.stringify(testPayload).length;
		if (testLen > maxLen && current.components.length > 0) {
			// Push current and start new
			payloads.push(current);
			current = { components: [cont], flags: baseFlags };
		} else {
			current.components.push(cont);
		}
	}
	if (current.components.length > 0) payloads.push(current);

	console.log("Built calendar embed with " + events.length + " events into " + containers.length + " containers, " + payloads.length + " payloads.");
	payloads.forEach((p, i) => console.log(`Payload[${i}]: ${JSON.stringify(p).length} chars`));
	return payloads.length === 1 ? payloads[0] : payloads;
}

// ----------------- helpers -----------------

function getISOWeek(date: Date) {
	const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = tmp.getUTCDay() || 7; tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
	const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	return { year: tmp.getUTCFullYear(), week: weekNo, };
}

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

	const subTypeEmoji = ev.subtype ?
		(EVENT_SUBTYPE_META[ev.subtype as keyof typeof EVENT_SUBTYPE_META]?.emoji || "") : "";

	// Ongoing events: replace the first timestamp with a green dot 🟢
	const leftPrefix = isOngoing ? "🟢" : `<t:${unix}:t>`;

	return `> ${leftPrefix} ${typeEmoji} ${subTypeEmoji} ${newText} ${title} <t:${unix}:R> • (${capBadge})${draftText}`;
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
