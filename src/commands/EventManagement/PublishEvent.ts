import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	GuildMember,
	Guild,
} from "discord.js";
import {
	userHasAllowedRole,
	getStandardRolesOrganizer,
	getStandardRolesHost
} from "../../helpers/securityHelpers";
import { publishEvent } from "../../helpers/publishEvent";
import { refreshPublishedCalender } from "../../helpers/refreshPublishedCalender";
import { writeLog } from "../../helpers/logger";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("publish-event")
		.setDescription("Publish an existing draft event.")
		.addNumberOption(option =>
			option
				.setName('id')
				.setDescription('Id of the event to publish.')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: ChatInputCommandInteraction) {
		writeLog(`PublishEvent command invoked by user ${interaction.member} tagged ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guild?.name} (${interaction.guildId})`);
		
		if (!userHasAllowedRole(interaction.member as GuildMember, getStandardRolesHost())) {
			await interaction.reply({
				content: "❌ You don't have permission for this command.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const id = interaction.options.getNumber('id');
		if (!id) {
			await interaction.reply({
				content: "❌ Please enter a valid Id.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		try {
			await publishEvent(interaction.client, interaction.guild as Guild, id);
			await refreshPublishedCalender(interaction.client, interaction.guildId as string, true);
			await interaction.editReply({ content: `Successfully published event: ${id}.` })
		} catch (e) {
			await interaction.editReply({ content: `Error publishing event: ${e}.` })
		}
	},
}; 