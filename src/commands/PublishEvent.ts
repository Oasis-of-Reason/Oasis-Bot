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
	getStandardRolesOrganizer
} from "../helpers/securityHelpers";
import { publishEvent } from "../helpers/publishEvent";
import { refreshPublishedCalender } from "../helpers/refreshPublishedCalender";

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

		if (!userHasAllowedRole(interaction.member as GuildMember, getStandardRolesOrganizer())) {
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

		await publishEvent(interaction.client, interaction.guild as Guild, id);
		await refreshPublishedCalender(interaction.client, interaction.guildId as string, true);
		interaction.reply({ content: `Successfully published event: ${id}.`, flags: MessageFlags.Ephemeral })
	},
}; 