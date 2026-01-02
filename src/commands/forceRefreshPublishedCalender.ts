import {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
	ChatInputCommandInteraction,
} from "discord.js";
import { refreshPublishedCalender } from "../helpers/refreshPublishedCalender";
import { TrackedInteraction } from "../utils/interactionSystem";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("force-refresh-published-calender")
		.setDescription("Manually refresh the published calender for this server.")
		.addBooleanOption(opt =>
			opt
				.setName("delete_and_resend")
				.setDescription("Delete the existing calender messages and resend them.")
				.setRequired(false)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(ix: TrackedInteraction) {
		const interaction = ix.interaction as ChatInputCommandInteraction;

		if (!ix.interaction.guild) {
			await ix.reply({
				content: "❌ This command can only be used inside a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const deleteAndResend =
			interaction.options.getBoolean("delete_and_resend") ?? false;

		try {
			await ix.deferReply({ ephemeral: true });

			// Call your function with the required parameters
			await refreshPublishedCalender(
				ix.interaction.client,         // Client
				ix.interaction.guild.id,       // guildId
				deleteAndResend             // deleteAndResend
			);

			await ix.editReply(
				deleteAndResend
					? "✅ Refreshed: existing calendar messages deleted and re-sent."
					: "✅ Refreshed: calendar messages updated where needed."
			);
		} catch (error) {
			console.error("Error refreshing published calender:", error);
			await ix.editReply(
				"❌ Failed to refresh the published calender. Check logs for details."
			);
		}
	},
};
