import { Client, TextChannel, ThreadChannel } from "discord.js";
import { prisma } from "../utils/prisma";
import { getEventButtons } from "./getEventButtons"; // or inline from above
import { buildEventEmbedWithLists } from "./buildEventEmbedWithLists";

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

	const embed = await buildEventEmbedWithLists(client, ev, attendees, ev.cohosts);
	const components = getEventButtons(eventId);

	// Edit the published channel message
	if (ev.publishedChannelId && ev.publishedChannelMessageId) {
		try {
			const ch = (await client.channels.fetch(ev.publishedChannelId)) as TextChannel;
			const msg = await ch.messages.fetch(ev.publishedChannelMessageId);
			await msg.edit({ embeds: [embed], components });
		} catch (e) {
			console.error("Failed to edit published channel message:", e);
		}
	}

	// Edit the published thread message
	if (ev.publishedThreadId && ev.publishedThreadMessageId) {
		try {
			const th = (await client.channels.fetch(ev.publishedThreadId)) as ThreadChannel;
			const tmsg = await th.messages.fetch(ev.publishedThreadMessageId);
			await tmsg.edit({ embeds: [embed], components });
		} catch (e) {
			console.error("Failed to edit published thread message:", e);
		}
	}
}
