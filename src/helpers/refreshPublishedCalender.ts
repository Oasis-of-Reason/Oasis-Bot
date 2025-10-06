import { PrismaClient } from '@prisma/client';
import { Client, TextChannel } from 'discord.js';
import { buildCalenderEmbed } from '../helpers/buildCalenderEmbed';
const prisma = new PrismaClient();

export async function refreshPublishedCalender(client: Client, guildId: string, deleteAndResend: boolean) {
	const now = new Date();
	const guildConfig = await prisma.guildConfig.findUnique({
		where: { id: guildId }
	});
	const channel = await client.channels.fetch(guildConfig?.publishingChannelId as string) as TextChannel;


	const events = await prisma.event.findMany({
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

	const embed = buildCalenderEmbed(events, guildId);

	let message;
	if (guildConfig?.eventCalenderMessageId) {
		try {
			message = await channel.messages.fetch(guildConfig?.eventCalenderMessageId);
		} catch {
			console.error("Couldnt find calender message.");
		}
	}

	if (!deleteAndResend && message) {
		await message.edit({ embeds: [embed] });
	}
	else {
		if (message) {
			await message?.delete();
		}

		const calenderMessage = await channel.send({ embeds: [embed] });

		if (calenderMessage) {
			await prisma.guildConfig.upsert({
				where: { id: guildId },
				update: {
					eventCalenderMessageId: calenderMessage.id
				},
				create: {
					id: guildId,
					eventCalenderMessageId: calenderMessage.id
				}
			});
		}
	}
}