// src/helpers/publishEvent.ts
import {
	Client,
	Guild,
	TextChannel,
	AnyThreadChannel,
	ChannelType,
	Message,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { buildEventEmbedWithLists } from "./buildEventEmbedWithLists";
import { getEventButtons } from "./getEventButtons";
import { getEventById, pingMap } from "./generalHelpers";

/* ---------- small helpers ---------- */

async function fetchTextChannel(client: Client, id?: string | null): Promise<TextChannel | null> {
	if (!id) return null;
	const cached = client.channels.cache.get(id);
	if (cached?.type === ChannelType.GuildText) return cached as TextChannel;
	const fetched = await client.channels.fetch(id).catch(() => null);
	return fetched?.type === ChannelType.GuildText ? (fetched as TextChannel) : null;
}

async function fetchThread(guild: Guild, id?: string | null): Promise<AnyThreadChannel | null> {
	if (!id) return null;
	const ch = await guild.channels.fetch(id).catch(() => null);
	if (!ch || (ch.type !== ChannelType.PublicThread && ch.type !== ChannelType.PrivateThread)) return null;
	const thread = ch as AnyThreadChannel;
	if (thread.archived) {
		try { await thread.setArchived(false, "Temporarily unarchive to edit event"); } catch { }
	}
	return thread;
}

async function fetchMsgInChannel(channel: TextChannel, messageId?: string | null): Promise<Message | null> {
	if (!messageId) return null;
	return await channel.messages.fetch(messageId).catch(() => null);
}
async function fetchMsgInThread(thread: AnyThreadChannel, messageId?: string | null): Promise<Message | null> {
	if (!messageId) return null;
	return await thread.messages.fetch(messageId).catch(() => null);
}

/* ---------- load signups/interest from DB ---------- */

async function loadSignupUserIds(eventId: number) {
	// Adjust field names if yours differ (assuming tables: EventSignUps, InterestedSignUps with userId fields)
	const [signups, cohosts] = await Promise.all([
		prisma.eventSignUps.findMany({ where: { eventId }, select: { userId: true }, orderBy: { createdAt: "asc" } }).catch(() => [] as { userId: string }[]),
		prisma.cohostsOnEvent.findMany({ where: { eventId }, select: { userId: true }, orderBy: { createdAt: "asc" } }).catch(() => [] as { userId: string }[]),
	]);
	return {
		signupUserIds: signups.map(s => s.userId),
		cohostsUserIds: cohosts.map(s => s.userId),
	};
}

/* ---------- main ---------- */

export async function publishEvent(client: Client, guild: Guild, eventId: number) {
	const guildConfig = await prisma.guildConfig.findUnique({ where: { id: guild.id } });
	const publishingEvent = await getEventById(eventId);

	// Always load latest signup/interest lists before rendering
	const { signupUserIds, cohostsUserIds } = await loadSignupUserIds(eventId);

	const defaultPublishingChannelId =
		(publishingEvent.type?.toLowerCase() === "vrc"
			? guildConfig?.publishingVRCChannelId
			: guildConfig?.publishingDiscordChannelId) ?? "";

	const embed = await buildEventEmbedWithLists(client, publishingEvent, signupUserIds, cohostsUserIds);
	const components = getEventButtons(eventId);

	// If already published → edit existing messages (or recreate missing ones)
	if (publishingEvent.published) {
		const publishedChannel = await fetchTextChannel(client, publishingEvent.publishedChannelId);
		const publishedThread = await fetchThread(guild, publishingEvent.publishedThreadId ?? null);

		let channelMsgId = publishingEvent.publishedChannelMessageId ?? null;
		let threadId = publishingEvent.publishedThreadId ?? null;
		let threadMsgId = publishingEvent.publishedThreadMessageId ?? null;

		// Channel message
		if (publishedChannel) {
			const existing = await fetchMsgInChannel(publishedChannel, channelMsgId);
			if (existing) {
				await existing.edit({ embeds: [embed], components });
			} else {
				const sent = await publishedChannel.send({ embeds: [embed], components });
				channelMsgId = sent.id;
			}
		}

		// Thread message
		if (publishedThread) {
			const existing = await fetchMsgInThread(publishedThread, threadMsgId);
			if (existing) {
				await existing.edit({ embeds: [embed], components });
			} else {
				const sent = await publishedThread.send({ embeds: [embed], components });
				threadMsgId = sent.id;
			}
			threadId = publishedThread.id;

			// Re-archive if we had unarchived earlier
			if (publishedThread.archived) {
				try { await publishedThread.setArchived(true, "Restore archived state after edit"); } catch { }
			}
		}

		// Persist any recreated pointers
		if (
			channelMsgId !== publishingEvent.publishedChannelMessageId ||
			threadMsgId !== publishingEvent.publishedThreadMessageId ||
			threadId !== publishingEvent.publishedThreadId
		) {
			await prisma.event.update({
				where: { id: eventId },
				data: {
					published: true,
					...(publishingEvent.publishedChannelId ? { publishedChannelId: publishingEvent.publishedChannelId } : {}),
					...(threadId ? { publishedThreadId: threadId } : {}),
					...(channelMsgId ? { publishedChannelMessageId: channelMsgId } : {}),
					...(threadMsgId ? { publishedThreadMessageId: threadMsgId } : {}),
				},
			});
		}

		return; // done editing
	}

	// First-time publish → send new messages
	const channel = await fetchTextChannel(client, defaultPublishingChannelId);
	if (!channel) throw new Error(`Publish channel not found: ${defaultPublishingChannelId}`);

	const sentChannel = await channel.send({ embeds: [embed], components });

	await sentChannel.reply({ content: "Pings: " + pingMap[publishingEvent.type.toLowerCase()][publishingEvent.subtype.toLowerCase()].label});

	const thread = await channel.threads.create({
		name: `Event: ${publishingEvent.title}`,
		autoArchiveDuration: 1440,
	});
	const sentThread = await thread.send({ embeds: [embed], components });

	await prisma.event.update({
		where: { id: eventId },
		data: {
			published: true,
			publishedChannelId: channel.id,
			publishedThreadId: thread.id,
			publishedChannelMessageId: sentChannel.id,
			publishedThreadMessageId: sentThread.id,
		},
	});
}
