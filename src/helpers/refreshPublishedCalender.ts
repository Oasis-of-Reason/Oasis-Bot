import { PrismaClient } from '@prisma/client';
import { Client, Message, TextChannel } from 'discord.js';
import { buildCalenderContainer } from '../helpers/buildCalenderEmbed';
import { fetchMsgInChannel, messageContainerEquals } from './discordHelpers';
const prisma = new PrismaClient();

export async function refreshPublishedCalender(client: Client, guildId: string, deleteAndResend: boolean) {
	const now = new Date(Date.now() - 2 * 60 * 60 * 1000); // -2 hours
	const guildConfig = await prisma.guildConfig.findUnique({
		where: { id: guildId }
	});

	// Fetch channels
	const discordChannel = await client.channels.cache.get(guildConfig?.publishingDiscordChannelId as string) as TextChannel ?? await client.channels.fetch(guildConfig!.publishingDiscordChannelId!) as TextChannel;
	const vrcChannel = await client.channels.cache.get(guildConfig?.publishingVRCChannelId as string) as TextChannel ?? await client.channels.fetch(guildConfig!.publishingVRCChannelId!) as TextChannel;
	const upcomingChannel = await client.channels.cache.get(guildConfig?.upcomingEventsChannelId as string) as TextChannel ?? await client.channels.fetch(guildConfig!.upcomingEventsChannelId!) as TextChannel;

	// Fetch events
	const discordEvents = await prisma.event.findMany({
		where: {
			guildId,
			startTime: { gte: now },
			published: true,
			type: "Discord"
		},
		orderBy: { startTime: 'asc' },
		include: { _count: { select: { signups: true } } }
	});

	const vrcEvents = await prisma.event.findMany({
		where: {
			guildId,
			startTime: { gte: now },
			published: true,
			type: "VRC"
		},
		orderBy: { startTime: 'asc' },
		include: { _count: { select: { signups: true } } }
	});

	const allEvents = await prisma.event.findMany({
		where: {
			guildId,
			startTime: { gte: now },
			published: true
		},
		orderBy: { startTime: 'asc' },
		include: { _count: { select: { signups: true } } }
	});

	// Split events into chunks of 15 each
	const discordChunks = chunkEventsByDay(discordEvents, 15);
	const vrcChunks = chunkEventsByDay(vrcEvents, 15);
	const allChunks = chunkEventsByDay(allEvents, 15);

	// Build multiple embeds per calendar
	const discordEmbeds = discordChunks.map((chunk, i) => buildCalenderContainer(chunk, guildId, false, false, i));
	const vrcEmbeds = vrcChunks.map((chunk, i) => buildCalenderContainer(chunk, guildId, false, false, i));
	const allEmbeds = allChunks.map((chunk, i) => buildCalenderContainer(chunk, guildId, false, false, i));

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

	// Process Upcoming calendar
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
			// push finished day
			dayGroups.push(currentDayEvents);
			// start new day group
			currentDayKey = dayKey;
			currentDayEvents = [ev];
		}
	}

	// push last day's events
	if (currentDayEvents.length > 0) {
		dayGroups.push(currentDayEvents);
	}

	// 2) Build chunks of whole days, respecting maxPerMessage where possible
	const chunks: T[][] = [];
	let currentChunk: T[] = [];
	let currentCount = 0;

	for (const dayEvents of dayGroups) {
		const dayCount = dayEvents.length;

		// If adding this entire day would exceed the limit,
		// start a new chunk *before* adding the day.
		// This ensures we never split a day across two messages.
		if (currentCount > 0 && currentCount + dayCount > maxPerMessage) {
			chunks.push(currentChunk);
			currentChunk = [];
			currentCount = 0;
		}

		// Now add the whole day to the current chunk.
		// Note: if dayCount > maxPerMessage, this chunk will exceed the max,
		// but the entire day stays together (as requested).
		currentChunk.push(...dayEvents);
		currentCount += dayCount;
	}

	if (currentChunk.length > 0) {
		chunks.push(currentChunk);
	}

	return chunks;
}

async function sendAndStoreMessages(
	channel: TextChannel,
	existingIds: string | null,
	embeds: any[],
	fieldName: "discordEventCalenderMessageId" | "vrcEventCalenderMessageId" | "upcomingEventsCalenderMessageId",
	guildId: string,
	deleteAndResend: boolean
) {
	// Convert string → list of IDs
	const ids = existingIds?.split(" ").filter(Boolean) ?? [];

	let messages: (Message<boolean> | null)[] = [];

	// Fetch existing messages IF not delete-and-resend
	for (const id of ids) {
		try {
			const m = await fetchMsgInChannel(channel, id);
			messages.push(m);
		} catch {
			messages.push(null);
		}
	}

	let anyChanged = false
	for (let i = 0; i < embeds.length && !anyChanged; i++) {
		anyChanged = anyChanged || !messageContainerEquals(messages[i] as Message<boolean>, embeds[i])
	}
	let calenderStillLast = messages[messages.length - 1]?.channel.lastMessageId === messages[messages.length - 1]?.id

	if (!anyChanged && !(deleteAndResend && !calenderStillLast)) {
		// No changes and no need for calender re-send to ensure place as last message in channel
		return;
	}

	// If delete & resend → delete old messages entirely
	if (deleteAndResend) {
		for (const id of ids) {
			try { await channel.messages.delete(id); } catch { }
		}
		messages = []; // start fresh
	}

	const newIds: string[] = [];

	// Iterate over calendar chunks and either edit or send new messages
	for (let i = 0; i < embeds.length; i++) {
		const embed = embeds[i];

		if (messages[i]) {
			// Message exists → edit it if needed
			const msg = messages[i]!;
			try {
				await msg.edit(embed);
				newIds.push(msg.id);
			} catch {
				// If edit fails → send fresh message
				const newMsg = await channel.send(embed);
				newIds.push(newMsg.id);
			}
		} else {
			// No existing message → send it
			const newMsg = await channel.send(embed);
			newIds.push(newMsg.id);
		}
	}

	// If there were too many old messages → delete extras
	if (messages.length > embeds.length) {
		for (let i = embeds.length; i < messages.length; i++) {
			const m = messages[i];
			if (m) {
				try { await m.delete(); } catch { }
			}
		}
	}

	// Save updated list of message IDs
	await prisma.guildConfig.update({
		where: { id: guildId },
		data: { [fieldName]: newIds.join(" ") }
	});
}