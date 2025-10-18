import {
	Client,
	TextChannel,
	MessageCreateOptions,
} from 'discord.js';
import { PrismaClient, GuildConfig } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Send a message with content, embed(s), and optional buttons to all guilds
 * that have a given channel configured.
 *
 * @param client Discord client instance
 * @param key The key from the GuildConfig model (e.g. 'twitchLiveChannel')
 * @param content The content of the message (plain text)
 * @param options Additional message options (embeds, components, etc.)
 */
export async function sendToGuildChannel(
	client: Client,
	key: keyof GuildConfig,
	content: string,
	options?: Omit<MessageCreateOptions, 'content'>
): Promise<void> {
	for (const [guildId] of client.guilds.cache) {
		try {
			const config = await prisma.guildConfig.findUnique({ where: { id: guildId } });
			const channelId = config?.[key];

			if (!channelId) {
				console.log(`[sendToGuildChannel] No channel configured for ${key} in guild ${String(guildId)}`);
				continue;
			}

			const channel = client.channels.cache.get(channelId) as TextChannel;
			if (!channel || !channel.isTextBased()) {
				console.warn(`[sendToGuildChannel] Invalid or missing text channel for guild ${String(guildId)}`);
				continue;
			}

			const messagePayload: MessageCreateOptions = {
				content,
				...options,
			};

			await channel.send(messagePayload);
		} catch (err) {
			console.error(`[sendToGuildChannel] Error sending message to guild ${String(guildId)}:`, err);
		}
	}
}
