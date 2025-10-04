import { PrismaClient } from '@prisma/client';
import { Client, TextChannel } from 'discord.js';
import { buildCalenderEmbed } from '../helpers/buildCalenderEmbed';
const prisma = new PrismaClient();
const PUBLISHING_CHANNEL_ID = "1423694714250465331";

export async function refreshPublishedCalender(client: Client, guildId: string, deleteAndResend: boolean)
{
    const now = new Date();
    const guildConfig = await prisma.guildConfig.findUnique({
				where: { id: guildId }
			});
    const channel = await client.channels.fetch(PUBLISHING_CHANNEL_ID) as TextChannel;
    

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
    if(guildConfig?.eventCalenderMessageId)
    {
        message = await channel.messages.fetch(guildConfig?.eventCalenderMessageId);
    }

    if(!deleteAndResend && message)
    {
        await message.edit({ embeds: [embed] });
    }
    else
    {
        await message?.delete();

        const calenderMessage = await channel.send({ embeds: [embed]});

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