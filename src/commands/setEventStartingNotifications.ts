import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";

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

	async execute(interaction: ChatInputCommandInteraction) {
		const enabled = interaction.options.getBoolean("enabled", true);
		const userId = interaction.user.id;

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

		await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
	},
};
