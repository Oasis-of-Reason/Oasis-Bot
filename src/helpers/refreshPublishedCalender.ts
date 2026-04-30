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

	if (!guildConfig) {
		console.error("Guild config not found for guild:", guildId);
		return;
	}

	// Fetch channels
	console.log("fetching channels");
	
	const fetchChannel = async (channelId: string | null | undefined): Promise<TextChannel | null> => {
		if (!channelId) {
			console.warn("Channel ID is null or undefined");
			return null;
		}
		try {
			return (client.channels.cache.get(channelId)) as TextChannel ??
				((await client.channels.fetch(channelId)) as TextChannel);
		} catch (error) {
			console.error(`Failed to fetch channel ${channelId}:`, error);
			return null;
		}
	};
	console.log("Discord Channel: " + guildConfig.publishingDiscordChannelId);
	console.log("VRC Channel: " + guildConfig.publishingVRCChannelId);
	console.log("Media Channel: " + guildConfig.publishingMediaChannelId);
	console.log("Upcoming Channel: " + guildConfig.upcomingEventsChannelId);
	const discordChannel = await fetchChannel(guildConfig.publishingDiscordChannelId);
	const vrcChannel = await fetchChannel(guildConfig.publishingVRCChannelId);
	const mediaChannel = await fetchChannel(guildConfig.publishingMediaChannelId);
	const upcomingChannel = await fetchChannel(guildConfig.upcomingEventsChannelId);

	if (!discordChannel || !vrcChannel || !mediaChannel || !upcomingChannel) {
		console.error("One or more required channels could not be fetched");
		return;
	}

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

	// Build multiple embeds per calendar
	const discordEmbeds = buildCalenderContainer(discordEvents, guildId, false, false);
	const vrcEmbeds = buildCalenderContainer(vrcEvents, guildId, false, false);
	const mediaEmbeds = buildCalenderContainer(mediaEvents, guildId, false, false);
	const allEmbeds = buildCalenderContainer(allEvents, guildId, false, false);

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

async function sendAndStoreMessages(
	channel: TextChannel,
	existingIds: string | null,
	embeds: any,
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

	const embedArray = Array.isArray(embeds) ? embeds : [embeds];

	let anyChanged = false;
	for (let i = 0; i < embedArray.length && !anyChanged; i++) {
		anyChanged = anyChanged || !messageContainerEquals(messages[i] as Message<boolean>, embedArray[i]);
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

	for (let i = 0; i < embedArray.length; i++) {
		const embed = embedArray[i];

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
	if (messages.length > embedArray.length) {
		for (let i = embedArray.length; i < messages.length; i++) {
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
