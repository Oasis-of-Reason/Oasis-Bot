import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";

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

	async execute(interaction: ChatInputCommandInteraction) {
		const enabled = interaction.options.getBoolean("enabled", true);
		const userId = interaction.user.id;

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

		await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
	},
};