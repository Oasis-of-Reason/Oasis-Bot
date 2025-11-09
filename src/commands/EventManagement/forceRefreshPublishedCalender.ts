import {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
} from "discord.js";
import { refreshPublishedCalender } from "../../helpers/refreshPublishedCalender";

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

	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({
				content: "❌ This command can only be used inside a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const deleteAndResend =
			interaction.options.getBoolean("delete_and_resend") ?? false;

		try {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			// Call your function with the required parameters
			await refreshPublishedCalender(
				interaction.client,         // Client
				interaction.guild.id,       // guildId
				deleteAndResend             // deleteAndResend
			);

			await interaction.editReply(
				deleteAndResend
					? "✅ Refreshed: existing calendar messages deleted and re-sent."
					: "✅ Refreshed: calendar messages updated where needed."
			);
		} catch (error) {
			console.error("Error refreshing published calender:", error);
			await interaction.editReply(
				"❌ Failed to refresh the published calender. Check logs for details."
			);
		}
	},
};
