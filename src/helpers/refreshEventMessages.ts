import { ChannelType, Client, TextChannel, ThreadChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { getEventButtons } from "./getEventButtons"; // or inline from above
import { buildEventEmbedWithLists } from "./buildEventEmbedWithLists";
import { fetchMsgInChannel } from "./discordHelpers";

export async function refreshEventMessages(client: Client, eventId: number) {
	// Pull everything we need in one go
	const ev = await prisma.event.findUnique({
		where: { id: eventId },
		include: {
			signups: true,         // EventSignUps[]
			cohosts: true,         // CohostsOnEvent[]
			_count: { select: { signups: true, interested: true, } },
		},
	});
	if (!ev) return;

	// Build mention arrays
	const attendees = ev.signups.map(s => `<${s.userId}>`);
	const cohosts = ev.cohosts.map(c => `<${c.userId}>`);

	const embed = await buildEventEmbedWithLists(client, ev, attendees, cohosts);
	const components = getEventButtons(eventId);

	// Edit the published channel message
	if (ev.publishedChannelId && ev.publishedChannelMessageId) {
		try {
			const ch = await client.channels.cache.get(ev.publishedChannelId) as TextChannel;
			const msg = await fetchMsgInChannel(ch, ev.publishedChannelMessageId);
			await msg?.edit({ embeds: [embed], components });
		} catch (e) {
			console.error("Failed to edit published channel message:", e);
		}
	}
}

export async function updateThreadTitle(
	client: Client,
	threadId: string,
	newTitle: string,
	eventId: number
): Promise<ThreadChannel | null> {
	try {
		// Fetch the channel
		const channel = await client.channels.fetch(threadId);

		// Make sure we actually got something and that it's a thread
		if (!channel || !channel.isThread()) {
			console.log("Not a thread channel:", threadId, "Resolved type:", channel?.type);
			return null;
		}

		const thread = channel as ThreadChannel;

		// Discord thread names have a length limit (100 chars), so be safe
		const updatedTitle = `Draft ${eventId}: ${newTitle}`.slice(0, 100);
		console.log("Renaming thread", thread.id, "to", updatedTitle);

		// If the thread is archived, unarchive it first
		if (thread.archived) {
			console.log("Thread is archived, unarchiving first…");
			await thread.setArchived(false, "Unarchive to rename thread");
		}

		// Now rename
		const updated = await thread.setName(updatedTitle, "Update event draft title");
		console.log("Thread title updated:", updated.name);

		return updated;
	} catch (err) {
		console.error("Failed to update thread title:", err);
		return null;
	}
}
