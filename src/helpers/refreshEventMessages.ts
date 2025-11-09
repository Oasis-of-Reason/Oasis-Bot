import { Client, TextChannel, ThreadChannel } from "discord.js";
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
