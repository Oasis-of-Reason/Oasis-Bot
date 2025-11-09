import { ChatInputCommandInteraction, Client, ButtonInteraction, MessageFlags } from "discord.js";
import { prisma } from "../../utils/prisma";
import { SlashCommandBuilder } from 'discord.js';
import { writeLog } from "../../helpers/logger";

module.exports = {
	data: new SlashCommandBuilder()
		.setName('list-my-events')
		.setDescription('List upcoming events you are hosting or attending.'),

	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({
				content: "❌ This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		try { handleListEventsSlashCommand(interaction, interaction.client);
		} catch (error) {
			console.error("Error handling list-my-events command:", error);
			writeLog("Error handling list-my-events command: " + error);
			await interaction.reply({
				content: "❌ An error occurred while fetching your events. Please try again later.",
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};

async function getUserUpcomingEventsMessage(userId: string, client: Client): Promise<string> {
    const now = new Date();

    const events = await prisma.event.findMany({
        where: {
            startTime: { gte: now },
            published: true,
            OR: [
                { hostId: userId },
                { signups: { some: { userId } } },
            ],
        },
        orderBy: { startTime: 'asc' },
        include: {
            _count: { select: { signups: true } },
        },
    });



    if (!events.length) {
		return "You have no upcoming events that you are hosting or attending.";
	}

    const hostingMap = new Map<string, string[]>();
    const attendingMap = new Map<string, string[]>();

    for (const event of events) {
        const isHost = event.hostId === userId;
        const date = new Date(event.startTime);
        const dateKey = date.toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });

        const unix = Math.floor(date.getTime() / 1000);
        const signupCount = event._count.signups ?? 0;
        const cap = event.capacityCap ?? 0;
        const capBadge = cap > 0 ? `${signupCount}/${cap}` : `${signupCount}`;
 
		const safeTitle = event.title?.replace(/[\[\]]/g, '') || 'Untitled Event';
		const link = event.publishedThreadId
			? `https://discord.com/channels/${event.guildId}/${event.publishedThreadId}`
			: event.publishedChannelId && event.publishedChannelMessageId
			? `https://discord.com/channels/${event.guildId}/${event.publishedChannelId}/${event.publishedChannelMessageId}`
			: null;

		const title = link ? `[${safeTitle}](${link})` : `**${safeTitle}**`;

        const line = `<t:${unix}:t> ${title} <t:${unix}:R> • (${capBadge})`;

        if (isHost) {
            if (!hostingMap.has(dateKey)) hostingMap.set(dateKey, []);
            hostingMap.get(dateKey)!.push(line);
        } else {
            if (!attendingMap.has(dateKey)) attendingMap.set(dateKey, []);
            attendingMap.get(dateKey)!.push(line);
        }
    }

    let message = `**Your Upcoming Events**\n`;

    if (hostingMap.size > 0) {
        message += `\n**Hosting**\n`;
        for (const [date, lines] of hostingMap.entries()) {
            message += `${date}\n`;
            for (const line of lines) {
                message += `> ${line}\n`;
            }
        }
    }

    if (attendingMap.size > 0) {
        message += `\n**Attending**\n`;
        for (const [date, lines] of attendingMap.entries()) {
            message += `${date}\n`;
            for (const line of lines) {
                message += `> ${line}\n`;
            }
        }
    }
		return message.trim();
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

export async function handleListEventsSlashCommand(interaction: ChatInputCommandInteraction, client: Client) {
    const message = await getUserUpcomingEventsMessage(interaction.user.id, client);

		await interaction.reply({
			content: message,
			ephemeral: true,
		});
	}

export async function handleListEventsButton(interaction: ButtonInteraction, client: Client) {
    const message = await getUserUpcomingEventsMessage(interaction.user.id, client);

		await interaction.reply({
			content: message,
			ephemeral: true,
		});
	}
