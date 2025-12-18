import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";
import { prisma } from "../utils/prisma";


export function getEventButtons(eventId: number) {
	const rowAttend = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(`ev:${eventId}:attend:on`).setLabel("Sign Up").setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId(`ev:${eventId}:attend:off`).setLabel("Sign Off").setStyle(ButtonStyle.Danger),
	);

	// Return an array of rows (<= 5 rows allowed)
	return [rowAttend];
}

export async function checkEventPublishedOrDraftOnly(id: string): Promise<boolean> {
	const event = await prisma.event.findUnique({
		where: { draftThreadMessageId: id },
		select: { published: true },
	});
	return !!(event?.published);
}