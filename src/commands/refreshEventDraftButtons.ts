// src/commands/DuplicateEvent.ts
import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
	GuildMember,
} from "discord.js";
import { prisma } from "../utils/prisma";
import {
	userHasAllowedRoleOrId,
	getStandardRolesOrganizer,
} from "../helpers/securityHelpers";
import { restoreEventDraftCollectors } from "../helpers/eventDraft";
import { TrackedInteraction } from "../utils/interactionSystem";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("refresh-event-draft-buttons")
		.setDescription("Refreshes buttons for an event if they stopped working.")
		.addNumberOption(opt =>
			opt.setName("id").setDescription("ID of the event to refresh buttons for").setRequired(true)
		),

	async execute(ix: TrackedInteraction) {
		if (!ix.interaction.guild) {
			await ix.reply({
				content: "❌ This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const interaction = ix.interaction as ChatInputCommandInteraction;
		const eventId = interaction.options.getNumber("id", true);
		await ix.deferReply({ ephemeral: true });

		// Load the source event
		const targetEvent = await prisma.event.findUnique({ where: { id: eventId } });
		if (!targetEvent) {
			await ix.editReply({ content: `❌ No event found with ID **${eventId}**.` });
			return;
		}

		// Permission: organizer OR original host
		const ok = userHasAllowedRoleOrId(
			ix.interaction.member as GuildMember,
			getStandardRolesOrganizer(),
			[targetEvent.hostId]
		);
		if (!ok) {
			await ix.editReply({ content: "❌ You don't have permission to refresh this draft." });
			return;
		}

		restoreEventDraftCollectors(ix.interaction.guild, targetEvent)

		// Done
		await ix.editReply({
			content: `✅ Refreshed buttons for event **#${eventId}.`,
		});
	},
};
