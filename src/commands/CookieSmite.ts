import {
	SlashCommandBuilder,
	MessageFlags,
	User,
	ChatInputCommandInteraction,
} from "discord.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-smite")
		.setDescription("Spend 20 cookies to timeout another user for 1 minute!")
		.addUserOption(option =>
			option
				.setName("target")
				.setDescription("The user you want to timeout.")
				.setRequired(true)
		)
		.setDMPermission(false),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) {
			await interaction.reply({
				content: "❌ This command can only be used inside a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const guild = interaction.guild;
		const guildId = guild.id;
		const senderId = interaction.user.id;
		const target = interaction.options.getUser("target") as User;

		// prevent self-targeting or targeting the bot
		if (target.id === senderId) {
			await interaction.reply({
				content: "❌ You can’t timeout yourself!",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		if (target.bot) {
			await interaction.reply({
				content: "🤖 You can’t timeout bots — they’re immune to cookie power.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		try {
			// Get or create sender cookie record
			const sender = await prisma.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: senderId } },
				update: {},
				create: {
					guildId,
					userId: senderId,
					cookies: 0,
					lastCookieAttempt: new Date(),
				},
			});

			const cost = 20;
			if (sender.cookies < cost) {
				await interaction.reply({
					content: `❌ You need **${cost} cookies** to use this! You only have **${sender.cookies}**.`,
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const member = await guild.members.fetch(target.id).catch(() => null);
			if (!member) {
				await interaction.reply({
					content: "❌ Couldn’t find that member in the server.",
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			// Try to timeout the user
			const timeoutDurationMs = 60 * 1000; // 1 minute

			try {
				await member.timeout(timeoutDurationMs, `Timed out by ${interaction.user.tag} using 20 cookies 🍪`);
			} catch (err) {
				console.error("Timeout error:", err);
				await interaction.reply({
					content: "❌ I couldn’t timeout that user. I may lack permissions or the user outranks me.",
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			// Deduct cookies
			await prisma.cookiesUser.update({
				where: { guildId_userId: { guildId, userId: senderId } },
				data: { cookies: { decrement: cost } },
			});

			await interaction.reply({
				content: `🔨 ${interaction.user} SMITED (timed out) ${target} for **1 minute** using **${cost} cookies**! 🍪`
			});
		} catch (error) {
			console.error("Error in /cookie-smite:", error);
			await interaction.reply({
				content: "❌ Something went wrong while trying to timeout the user.",
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
