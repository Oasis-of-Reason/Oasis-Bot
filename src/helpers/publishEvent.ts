import {
	Client,
	Guild,
	ThreadAutoArchiveDuration,
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
import { allowedPingRolesEvents } from "./generalConstants";
import { writeLog } from "./logger";
import { createOrUpdateGoogleEvent } from "../commands/googleCalendarBot";


export async function publishEvent(client: Client, guild: Guild, eventId: number) {
	const guildConfig = await prisma.guildConfig.findUnique({ where: { id: guild.id } });
	const publishingEvent = await getEventById(eventId);

	if (!publishingEvent) {
		console.error(`Could not find event to publish: ${eventId}`);
		throw new Error(`Could not find event to publish: ${eventId}`);
	}

	// Always load latest signup/interest lists before rendering
	const { signupUserIds, cohostsUserIds } = await loadSignupUserIds(eventId);

	const defaultPublishingChannelId =
	(publishingEvent.subtype === "CINEMA"
		? guildConfig?.publishingMediaChannelId
		: (publishingEvent.type === "VRCHAT"
			? guildConfig?.publishingVRCChannelId
			: guildConfig?.publishingDiscordChannelId)) ?? "";

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
			// Re-archive if we had unarchived earlie
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
	await sentChannel.reply({
		content: "Pings: " + getPingString(publishingEvent.type, publishingEvent.subtype),
		allowedMentions: { roles: allowedPingRolesEvents },
	});

	// Trigger publish on Google Calendar
	// await createOrUpdateGoogleEvent(publishingEvent, false, "publish");

	const thread = await sentChannel.startThread({
		name: `${publishingEvent.subtype}: ${publishingEvent.title}`,
		autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
	});

	await prisma.event.update({
		where: { id: eventId },
		data: {
			published: true,
			publishedAt: new Date(),
			publishedChannelId: channel.id,
			publishedThreadId: thread.id,
			publishedChannelMessageId: sentChannel.id,
			publishedThreadMessageId: null,
		},
	});
}

export async function addHostToEventThread(guild: Guild, eventId: number) {
	writeLog(`Adding host to event thread for event ${eventId}`);
	const event = await getEventById(eventId);
	if (event) {
		try {
			if (!event?.published || !event.publishedThreadId) return;
			const thread = await fetchThread(guild, event.publishedThreadId);
			if (!thread) return;

			const hostUserId = (await prisma.event.findUnique({
				where: { id: eventId },
				select: { hostId: true },
			}))?.hostId

			// Add host to thread
			if (hostUserId) {
				try {
					await thread.members.add(hostUserId);
				} catch (err) {
					console.warn(`Failed to add host to thread: ${err}`);
				}
			}
		} catch (error) {
			writeLog(`Error adding host to event thread: ${error}: ` + "error");
		}
	}
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