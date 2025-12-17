import { PrismaClient } from '@prisma/client';
import { Client, Message, TextChannel } from 'discord.js';
import { buildCalenderContainer } from '../helpers/buildCalenderEmbed';
import { fetchMsgInChannel, messageContainerEquals, messageEmbedEquals } from './discordHelpers';
const prisma = new PrismaClient();

export async function refreshPublishedCalender(client: Client, guildId: string, deleteAndResend: boolean) {
	const now = new Date(Date.now() - 2 * 60 * 60 * 1000); // -2 hours
	const guildConfig = await prisma.guildConfig.findUnique({
		where: { id: guildId }
	});

	const discordChannel = await client.channels.cache.get(guildConfig?.publishingDiscordChannelId as string) as TextChannel ?? await client.channels.fetch(guildConfig?.publishingDiscordChannelId as string) as TextChannel;
	const vrcChannel = await client.channels.cache.get(guildConfig?.publishingVRCChannelId as string) as TextChannel ?? await client.channels.fetch(guildConfig?.publishingVRCChannelId as string) as TextChannel;
	const upcomingEventsChannel = await client.channels.cache.get(guildConfig?.upcomingEventsChannelId as string) as TextChannel ?? await client.channels.fetch(guildConfig?.upcomingEventsChannelId as string) as TextChannel;

	const discordEvents = await prisma.event.findMany({
		where: {
			guildId: guildId,
			startTime: { gte: now },
			published: true,
			type: "DISCORD"
		},
		orderBy: { startTime: 'asc' },
		include: {
			_count: { select: { signups: true } },
		},
	});
	const vrcEvents = await prisma.event.findMany({
		where: {
			guildId: guildId,
			startTime: { gte: now },
			published: true,
			type: "VRCHAT"
		},
		orderBy: { startTime: 'asc' },
		include: {
			_count: { select: { signups: true } },
		},
	});
	const allEvents = await prisma.event.findMany({
		where: {
			guildId: guildId,
			startTime: { gte: now },
			published: true,
		},
		orderBy: { startTime: 'asc' },
		include: {
			_count: { select: { signups: true } },
		},
	});

	
	const discordEmbed = buildCalenderContainer(discordEvents, guildId);
	
	const vrcEmbed = buildCalenderContainer(vrcEvents, guildId);
	const allEmbed = buildCalenderContainer(allEvents, guildId);

	let discordMessage;
	if (guildConfig?.discordEventCalenderMessageId) {
		try {
			discordMessage = await fetchMsgInChannel(discordChannel, guildConfig?.discordEventCalenderMessageId);
		} catch {
			console.error("Couldnt find calender message.");
		}
	}

	let vrcMessage;
	if (guildConfig?.vrcEventCalenderMessageId) {
		try {
			vrcMessage = await fetchMsgInChannel(vrcChannel, guildConfig?.vrcEventCalenderMessageId);
		} catch {
			console.error("Couldnt find calender message.");
		}
	}

	let allMessage;
	if (guildConfig?.upcomingEventsCalenderMessageId) {
		try {
			allMessage = await fetchMsgInChannel(upcomingEventsChannel, guildConfig?.upcomingEventsCalenderMessageId);
		} catch {
			console.error("Couldnt find calender message.");
		}
	}

	if (!messageContainerEquals(discordMessage as Message<boolean>, discordEmbed) || (deleteAndResend && !(discordMessage?.channel.lastMessageId === discordMessage?.id))) {
		if (!deleteAndResend && discordMessage) {
			await discordMessage.edit(discordEmbed);
		}
		else {
			if (discordMessage) {
				await discordMessage?.delete();
			}

			const calenderMessage = await discordChannel.send(discordEmbed);

			if (calenderMessage) {
				await prisma.guildConfig.upsert({
					where: { id: guildId },
					update: {
						discordEventCalenderMessageId: calenderMessage.id
					},
					create: {
						id: guildId,
						discordEventCalenderMessageId: calenderMessage.id
					}
				});
			}
		}
	}

	if (!messageContainerEquals(vrcMessage as Message<boolean>, vrcEmbed) || (deleteAndResend && !(vrcMessage?.channel.lastMessageId === vrcMessage?.id))) {
		if (!deleteAndResend && vrcMessage) {
			await vrcMessage.edit(vrcEmbed);
		}
		else {
			if (vrcMessage) {
				await vrcMessage?.delete();
			}

			const calenderMessage = await vrcChannel.send(vrcEmbed);

			if (calenderMessage) {
				await prisma.guildConfig.upsert({
					where: { id: guildId },
					update: {
						vrcEventCalenderMessageId: calenderMessage.id
					},
					create: {
						id: guildId,
						vrcEventCalenderMessageId: calenderMessage.id
					}
				});
			}
		}
	}

	if (!messageContainerEquals(allMessage as Message<boolean>, allEmbed) || (deleteAndResend && !(allMessage?.channel.lastMessageId === allMessage?.id))) {
		if (!deleteAndResend && allMessage) {
			await allMessage.edit(allEmbed);
		}
		else {
			if (allMessage) {
				await allMessage?.delete();
			}

			const calenderMessage = await upcomingEventsChannel.send(allEmbed);

			if (calenderMessage) {
				await prisma.guildConfig.upsert({
					where: { id: guildId },
					update: {
						upcomingEventsCalenderMessageId: calenderMessage.id
					},
					create: {
						id: guildId,
						upcomingEventsCalenderMessageId: calenderMessage.id
					}
				});
			}
		}
	}
}