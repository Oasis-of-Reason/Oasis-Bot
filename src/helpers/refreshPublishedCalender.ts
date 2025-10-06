import { PrismaClient } from '@prisma/client';
import { Client, TextChannel } from 'discord.js';
import { buildCalenderEmbed } from '../helpers/buildCalenderEmbed';
const prisma = new PrismaClient();

export async function refreshPublishedCalender(client: Client, guildId: string, deleteAndResend: boolean) {
	const now = new Date();
	const guildConfig = await prisma.guildConfig.findUnique({
		where: { id: guildId }
	});

	const discordChannel = await client.channels.fetch(guildConfig?.publishingDiscordChannelId as string) as TextChannel;
	const vrcChannel = await client.channels.fetch(guildConfig?.publishingVRCChannelId as string) as TextChannel;

	const discordEvents = await prisma.event.findMany({
		where: {
			guildId: guildId,
			startTime: { gte: now },
			published: true,
			type: "Discord"
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
			type: "VRC"
		},
		orderBy: { startTime: 'asc' },
		include: {
			_count: { select: { signups: true } },
		},
	});

	const discordEmbed = buildCalenderEmbed(discordEvents, guildId);
	const vrcEmbed = buildCalenderEmbed(vrcEvents, guildId);

	let discordMessage;
	if (guildConfig?.discordEventCalenderMessageId) {
		try {
			discordMessage = await discordChannel.messages.fetch(guildConfig?.discordEventCalenderMessageId);
		} catch {
			console.error("Couldnt find calender message.");
		}
	}

	if (!deleteAndResend && discordMessage) {
		await discordMessage.edit({ embeds: [discordEmbed] });
	}
	else {
		if (discordMessage) {
			await discordMessage?.delete();
		}

		const calenderMessage = await discordChannel.send({ embeds: [discordEmbed] });

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

	let vrcMessage;
	if (guildConfig?.vrcEventCalenderMessageId) {
		try {
			vrcMessage = await vrcChannel.messages.fetch(guildConfig?.vrcEventCalenderMessageId);
		} catch {
			console.error("Couldnt find calender message.");
		}
	}

	if (!deleteAndResend && vrcMessage) {
		await vrcMessage.edit({ embeds: [vrcEmbed] });
	}
	else {
		if (vrcMessage) {
			await vrcMessage?.delete();
		}

		const calenderMessage = await vrcChannel.send({ embeds: [vrcEmbed] });

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