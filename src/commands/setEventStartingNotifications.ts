import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { TrackedInteraction } from "../utils/interactionSystem";

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("set-event-starting-notifications")
		.setDescription("Enable or disable 'event is starting' notifications.")
		.addBooleanOption(option =>
			option
				.setName("enabled")
				.setDescription("Whether to receive DMs when an event is starting")
				.setRequired(true)
		),

	async execute(ix: TrackedInteraction) {
		const interaction = ix.interaction as ChatInputCommandInteraction;
		const enabled = interaction.options.getBoolean("enabled", true);
		const userId = ix.interaction.user.id;

		await prisma.user.upsert({
			where: { id: userId },
			update: { eventStartingNotifications: enabled },
			create: {
				id: userId,
				eventStartingNotifications: enabled,
				reminderMinutesBefore: 30,
			},
		});

		const msg = enabled
			? "🔔 You will now be notified when an event starts!"
			: "🔕 You will no longer receive 'event starting' notifications.";

		await ix.reply({ content: msg, flags: MessageFlags.Ephemeral });
	},
};
