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

export async function updateThreadTitle(client: any, threadId: string, newTitle: string, eventId: number): Promise<ThreadChannel | null>{
try {
        const thread = await client.channels.fetch(threadId);

        // Ensure we actually got a thread channel
        if (!thread || thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread) {
            console.log("Not a thread channel:", threadId);
            return null;
        }
		const updatedTitle = ("Draft " + eventId + ": " + newTitle);
        const updated = await thread.setName(updatedTitle);
        console.log("Thread title updated:", updated.name);

        return updated;

    } catch (err) {
        console.error("Failed to update thread title:", err);
        return null;
    }
}
