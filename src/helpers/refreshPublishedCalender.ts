import { PrismaClient } from "@prisma/client";
import { Client, Message, TextChannel } from "discord.js";
import { buildCalenderContainer } from "../helpers/buildCalenderEmbed";
import { fetchMsgInChannel, messageContainerEquals } from "./discordHelpers";
const prisma = new PrismaClient();

export async function refreshPublishedCalender(
	client: Client,
	guildId: string,
	deleteAndResend: boolean
) {
	const now = new Date(Date.now() - 2 * 60 * 60 * 1000); // -2 hours
	console.log('refreshing calendars, now is: ' + now.toISOString());
	const guildConfig = await prisma.guildConfig.findUnique({
		where: { id: guildId },
	});

	// Fetch channels
	console.log("fetching channels");
	const discordChannel =
		((await client.channels.cache.get(guildConfig?.publishingDiscordChannelId as string)) as TextChannel) ??
		((await client.channels.fetch(guildConfig!.publishingDiscordChannelId!)) as TextChannel);

	const vrcChannel =
		((await client.channels.cache.get(guildConfig?.publishingVRCChannelId as string)) as TextChannel) ??
		((await client.channels.fetch(guildConfig!.publishingVRCChannelId!)) as TextChannel);

	const mediaChannel =
		((await client.channels.cache.get(guildConfig?.publishingMediaChannelId as string)) as TextChannel) ??
		((await client.channels.fetch(guildConfig!.publishingMediaChannelId!)) as TextChannel);

	const upcomingChannel =
		((await client.channels.cache.get(guildConfig?.upcomingEventsChannelId as string)) as TextChannel) ??
		((await client.channels.fetch(guildConfig!.upcomingEventsChannelId!)) as TextChannel);
		console.log("fetched channels");
	// Fetch events
	// Discord events: exclude CINEMA
	const discordEvents = await prisma.event.findMany({
		where: {
			guildId,
			startTime: { gte: now },
			published: true,
			type: "DISCORD",
			subtype: { not: "CINEMA" },
		},
		orderBy: { startTime: "asc" },
		include: { _count: { select: { signups: true } } },
	});

	// VRC events: exclude CINEMA
	const vrcEvents = await prisma.event.findMany({
		where: {
			guildId,
			startTime: { gte: now },
			published: true,
			type: "VRCHAT",
			subtype: { not: "CINEMA" },
		},
		orderBy: { startTime: "asc" },
		include: { _count: { select: { signups: true } } },
	});

	// Media events: CINEMA only (any type)
	const mediaEvents = await prisma.event.findMany({
		where: {
			guildId,
			startTime: { gte: now },
			published: true,
			subtype: "CINEMA",
		},
		orderBy: { startTime: "asc" },
		include: { _count: { select: { signups: true } } },
	});

	// All events: includes everything (including CINEMA)
	const allEvents = await prisma.event.findMany({
		where: {
			guildId,
			startTime: { gte: now },
			published: true,
		},
		orderBy: { startTime: "asc" },
		include: { _count: { select: { signups: true } } },
	});

	// Split events into chunks of 15 each (day-aware)
	const discordChunks = chunkEventsByDay(discordEvents, 15);
	const vrcChunks = chunkEventsByDay(vrcEvents, 15);
	const mediaChunks = chunkEventsByDay(mediaEvents, 15);
	const allChunks = chunkEventsByDay(allEvents, 15);

	// Build multiple embeds per calendar
	const discordEmbeds = discordChunks.map((chunk, i) =>
		buildCalenderContainer(chunk, guildId, false, false, i)
	);
	const vrcEmbeds = vrcChunks.map((chunk, i) =>
		buildCalenderContainer(chunk, guildId, false, false, i)
	);
	const mediaEmbeds = mediaChunks.map((chunk, i) =>
		buildCalenderContainer(chunk, guildId, false, false, i)
	);
	const allEmbeds = allChunks.map((chunk, i) =>
		buildCalenderContainer(chunk, guildId, false, false, i)
	);

	// Process Discord calendar messages
	await sendAndStoreMessages(
		discordChannel,
		guildConfig!.discordEventCalenderMessageId,
		discordEmbeds,
		"discordEventCalenderMessageId",
		guildId,
		deleteAndResend
	);

	// Process VRC calendar messages
	await sendAndStoreMessages(
		vrcChannel,
		guildConfig!.vrcEventCalenderMessageId,
		vrcEmbeds,
		"vrcEventCalenderMessageId",
		guildId,
		deleteAndResend
	);

	// Process Media (CINEMA) calendar messages
	await sendAndStoreMessages(
		mediaChannel,
		guildConfig!.mediaEventCalenderMessageId,
		mediaEmbeds,
		"mediaEventCalenderMessageId",
		guildId,
		deleteAndResend
	);

	// Process Upcoming calendar (all events)
	await sendAndStoreMessages(
		upcomingChannel,
		guildConfig!.upcomingEventsCalenderMessageId,
		allEmbeds,
		"upcomingEventsCalenderMessageId",
		guildId,
		deleteAndResend
	);
}

// Expects events already sorted by startTime ascending
export function chunkEventsByDay<T extends { startTime: Date }>(
	events: T[],
	maxPerMessage = 15
): T[][] {
	if (events.length === 0) return [];

	// 1) Group events by day (YYYY-MM-DD)
	const dayGroups: T[][] = [];
	let currentDayKey: string | null = null;
	let currentDayEvents: T[] = [];

	for (const ev of events) {
		const dayKey = ev.startTime.toISOString().slice(0, 10); // YYYY-MM-DD

		if (currentDayKey === null) {
			currentDayKey = dayKey;
			currentDayEvents.push(ev);
			continue;
		}

		if (dayKey === currentDayKey) {
			currentDayEvents.push(ev);
		} else {
			dayGroups.push(currentDayEvents);
			currentDayKey = dayKey;
			currentDayEvents = [ev];
		}
	}

	if (currentDayEvents.length > 0) dayGroups.push(currentDayEvents);

	// 2) Build chunks of whole days, respecting maxPerMessage where possible
	const chunks: T[][] = [];
	let currentChunk: T[] = [];
	let currentCount = 0;

	for (const dayEvents of dayGroups) {
		const dayCount = dayEvents.length;

		// If adding this entire day would exceed the limit, start a new chunk first
		if (currentCount > 0 && currentCount + dayCount > maxPerMessage) {
			chunks.push(currentChunk);
			currentChunk = [];
			currentCount = 0;
		}

		currentChunk.push(...dayEvents);
		currentCount += dayCount;
	}

	if (currentChunk.length > 0) chunks.push(currentChunk);

	return chunks;
}

async function sendAndStoreMessages(
	channel: TextChannel,
	existingIds: string | null,
	embeds: any[],
	fieldName:
		| "discordEventCalenderMessageId"
		| "vrcEventCalenderMessageId"
		| "mediaEventCalenderMessageId"
		| "upcomingEventsCalenderMessageId",
	guildId: string,
	deleteAndResend: boolean
) {
	console.log("entered function sendandStoreMessage, about to create ids");
	const ids = existingIds?.split(" ").filter(Boolean) ?? [];

	let messages: (Message<boolean> | null)[] = [];
	console.log("ids = " + ids);
	// Fetch existing messages
	for (const id of ids) {
		try {
			const m = await fetchMsgInChannel(channel, id);
			messages.push(m);
		} catch {
			messages.push(null);
		}
	}

	let anyChanged = false;
	for (let i = 0; i < embeds.length && !anyChanged; i++) {
		anyChanged = anyChanged || !messageContainerEquals(messages[i] as Message<boolean>, embeds[i]);
	}
	const calenderStillLast =
		messages[messages.length - 1]?.channel.lastMessageId === messages[messages.length - 1]?.id;

	if (!anyChanged && !(deleteAndResend && !calenderStillLast)) {
		return;
	}

	if (deleteAndResend) {
		for (const id of ids) {
			try {
				await channel.messages.delete(id);
			} catch { }
		}
		messages = [];
	}

	const newIds: string[] = [];

	for (let i = 0; i < embeds.length; i++) {
		const embed = embeds[i];

		if (messages[i]) {
			const msg = messages[i]!;
			try {
				await msg.edit(embed);
				newIds.push(msg.id);
			} catch {
				const newMsg = await channel.send(embed);
				newIds.push(newMsg.id);
			}
		} else {
			const newMsg = await channel.send(embed);
			newIds.push(newMsg.id);
		}
	}

	// Delete extra old messages if we now have fewer chunks
	if (messages.length > embeds.length) {
		for (let i = embeds.length; i < messages.length; i++) {
			const m = messages[i];
			if (m) {
				try {
					await m.delete();
				} catch { }
			}
		}
	}

	await prisma.guildConfig.update({
		where: { id: guildId },
		data: { [fieldName]: newIds.join(" ") },
	});
}
