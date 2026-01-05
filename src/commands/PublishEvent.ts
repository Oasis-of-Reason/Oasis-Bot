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
} from "../helpers/securityHelpers";
import { publishEvent } from "../helpers/publishEvent";
import { refreshPublishedCalender } from "../helpers/refreshPublishedCalender";
import { writeLog } from "../helpers/logger";
import { TrackedInteraction } from "../utils/interactionSystem";

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

	async execute(ix: TrackedInteraction) {
		writeLog(`PublishEvent command invoked by user ${ix.interaction.member} tagged ${ix.interaction.user.tag} (${ix.interaction.user.id}) in guild ${ix.interaction.guild?.name} (${ix.guildId})`);
		
		if (!userHasAllowedRole(ix.interaction.member as GuildMember, getStandardRolesHost())) {
			await ix.reply({
				content: "❌ You don't have permission for this command.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const interaction = ix.interaction as ChatInputCommandInteraction;
		const id = interaction.options.getNumber('id');
		if (!id) {
			await ix.reply({
				content: "❌ Please enter a valid Id.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await ix.deferReply({ ephemeral: true });
		try {
			await publishEvent(ix.interaction.client, ix.interaction.guild as Guild, id);
			await refreshPublishedCalender(ix.interaction.client, ix.guildId as string, true);
			await ix.editReply({ content: `Successfully published event: ${id}.` })
		} catch (e) {
			await ix.editReply({ content: `Error publishing event: ${e}.` })
		}
	},
}; 