
import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("set-reminder-minutes")
		.setDescription("Set how many minutes before an event you'd like to be reminded (0 to disable).")
		.addIntegerOption(option =>
			option
				.setName("minutes")
				.setDescription("Number of minutes before event (0 disables reminders)")
				.setRequired(true)
				.setMinValue(0)
				.setMaxValue(1440)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const minutes = interaction.options.getInteger("minutes", true);
		const userId = interaction.user.id;

		await prisma.user.upsert({
			where: { id: userId },
			update: { reminderMinutesBefore: minutes },
			create: { id: userId, reminderMinutesBefore: minutes },
		});

		const msg =
			minutes === 0
				? "⏸️ You will no longer receive pre-event reminders."
				: `✅ You will now receive reminders **${minutes} minute${minutes === 1 ? "" : "s"}** before an event.`;

		await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
	},
};
