import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";

export function getEventButtons(eventId: number) {
	const rowAttend = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId(`ev:${eventId}:attend:on`).setLabel("Sign Up").setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId(`ev:${eventId}:cohost:on`).setLabel("Cohost").setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId(`ev:${eventId}:attend:off`).setLabel("Sign Off").setStyle(ButtonStyle.Danger),
	);

	// Return an array of rows (<= 5 rows allowed)
	return [rowAttend];
}
