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
		.setName("set-reminder-notifications")
		.setDescription("Enable or disable pre-event reminder notifications.")
		.addBooleanOption(option =>
			option
				.setName("enabled")
				.setDescription("Whether to enable reminders before events")
				.setRequired(true)
		),

	async execute(ix: TrackedInteraction) {
		const interaction = ix.interaction as ChatInputCommandInteraction;
		const enabled = interaction.options.getBoolean("enabled", true);
		const userId = ix.interaction.user.id;

		await prisma.user.upsert({
			where: { id: userId },
			update: { reminderNotifications: enabled },
			create: {
				id: userId,
				reminderNotifications: enabled,
				reminderMinutesBefore: 30, // sensible default
			},
		});

		const msg = enabled
			? "🔔 You will now receive pre-event reminder notifications."
			: "🔕 Pre-event reminders have been disabled.";

		await ix.reply({ content: msg, flags: MessageFlags.Ephemeral });
	},
};