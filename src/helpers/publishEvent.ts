import {
	Client,
	Guild,
} from "discord.js";
import { 
	getEventById, 
	getPingString
} from "./generalHelpers";
import { 
	fetchTextChannel, 
	fetchThread, 
	fetchMsgInChannel, 
	fetchMsgInThread
} from "./discordHelpers";
import { prisma } from "../utils/prisma";
import { buildEventEmbedWithLists } from "./buildEventEmbedWithLists";
import { getEventButtons } from "./getEventButtons";
import { allowedPingRoles } from "./generalConstants";

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

		return;
	}

	// First-time publish → send new messages
	const channel = await fetchTextChannel(client, defaultPublishingChannelId);
	if (!channel) throw new Error(`Publish channel not found: ${defaultPublishingChannelId}`);

	const sentChannel = await channel.send({ embeds: [embed], components });

	// Send pings message
	await sentChannel.reply({ content: "Pings: " + getPingString(publishingEvent.type, publishingEvent.subtype),
							  allowedMentions: { roles: allowedPingRoles },
	});

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

async function loadSignupUserIds(eventId: number) {
	
	const [signups, cohosts] = await Promise.all([
		prisma.eventSignUps.findMany({ where: { eventId }, select: { userId: true }, orderBy: { createdAt: "asc" } }).catch(() => [] as { userId: string }[]),
		prisma.cohostsOnEvent.findMany({ where: { eventId }, select: { userId: true }, orderBy: { createdAt: "asc" } }).catch(() => [] as { userId: string }[]),
	]);
	return {
		signupUserIds: signups.map(s => s.userId),
		cohostsUserIds: cohosts.map(s => s.userId),
	};
}