import {
	SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction, ComponentType,
	Message, MessageFlags
} from "discord.js";

import * as chrono from "chrono-node";
import { TrackedInteraction } from "../utils/interactionSystem";

const FORMATS = [
	{ label: "Short time", value: "t", description: "15:03" },
	{ label: "Long time", value: "T", description: "15:03:30" },
	{ label: "Short date", value: "d", description: "30/06/2021" },
	{ label: "Long date", value: "D", description: "30 June 2021" },
	{ label: "Short datetime", value: "f", description: "30 June 2021 15:03" },
	{ label: "Long datetime", value: "F", description: "Wednesday, 30 June 2021 15:03" },
	{ label: "Relative", value: "R", description: "2 months ago" },
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName("timestamp")
		.setDescription("Convert a date/time into Discord timestamp format and DM it to you")
		.addStringOption(opt =>
			opt
				.setName("datetime")
				.setDescription("Date/time to convert (ISO, JS parseable, or epoch seconds/ms)")
				.setRequired(true)
		),

	async execute(ix: TrackedInteraction) {
		const interaction = ix.interaction as ChatInputCommandInteraction;
		const input = interaction.options.getString("datetime", true).trim();

		// Parse input
		// First try chrono natural language parsing
		let date = chrono.parseDate(input);

		// If chrono fails, fall back to JS Date and numeric epoch
		if (!date) {
			date = new Date(input);
			if (isNaN(date.getTime())) {
				const num = Number(input);
				if (!Number.isNaN(num)) {
					// guess: >= 1e12 is ms, else seconds
					date = num >= 1e12 ? new Date(num) : new Date(num * 1000);
				}
			}
		}

		if (isNaN(date.getTime())) {
			await ix.reply({
				content:
					"❌ Could not parse that date/time. Try ISO (2025-09-27T15:00), `YYYY-MM-DD HH:MM`, or epoch seconds.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const unixSeconds = Math.floor(date.getTime() / 1000);

		// Build select menu
		const select = new StringSelectMenuBuilder()
			.setCustomId("ts_format")
			.setPlaceholder("Choose a Discord timestamp format")
			.setMinValues(1)
			.setMaxValues(1)
			.addOptions(
				FORMATS.map((f) => ({
					label: f.label,
					description: f.description,
					value: f.value,
				}))
			);

		const row =
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
		const preview = `<t:${unixSeconds}:F>`; // Discord long datetime format

		// Initial ephemeral reply with menu
		const response = await ix.reply({ content: `Picked up date: ${preview} (renders in *your* local time)
  ISO (UTC): \`${date.toISOString()}\`
  Unix seconds: **${unixSeconds}**
  Choose which Discord timestamp format you want:`,
			components: [row],
			flags: MessageFlags.Ephemeral,
			fetchReply: true},
		);

		try {
			// Wait for the user to pick a format (60s)
			if(!response.response || !(response.response as Message))
			{
				throw("no response");
			}
			const collected = (await (response.response as Message).awaitMessageComponent({
				filter: (i: StringSelectMenuInteraction) =>
					i.user.id === ix.interaction.user.id && i.customId === "ts_format",
				componentType: ComponentType.StringSelect,
				time: 60_000,
			})) as StringSelectMenuInteraction;

			await collected.deferUpdate();

			const fmt = collected.values[0];
			const discordString = `<t:${unixSeconds}:${fmt}>`;

			// Edit the ephemeral reply with the result
			await ix.editReply({
				content: `Here is your Discord timestamp:\n\`${discordString}\`\nRendered: ${discordString}`,
				components: [],
			});
		} catch {
			await ix.editReply({
				content: "⌛ No selection made. Command timed out.",
				components: [],
			});
		}
	}
}