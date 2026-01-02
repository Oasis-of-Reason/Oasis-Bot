import {
	SlashCommandBuilder,
	MessageFlags,
	User,
	ChatInputCommandInteraction,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { TrackedInteraction } from "../utils/interactionSystem";

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-transfer")
		.setDescription("Transfer some of your cookies to another user.")
		.addUserOption(option =>
			option
				.setName("recipient")
				.setDescription("The user to give cookies to.")
				.setRequired(true))
		.addIntegerOption(option =>
			option
				.setName("amount")
				.setDescription("The number of cookies to transfer.")
				.setMinValue(1)
				.setRequired(true)),

	async execute(ix: TrackedInteraction) {
		const interaction = ix.interaction as ChatInputCommandInteraction;
		if (!interaction.guild) {
			await ix.reply({
				content: "❌ This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const guildId = interaction.guild.id;
		const senderId = interaction.user.id;
		const recipient = interaction.options.getUser("recipient") as User;
		const amount = interaction.options.getInteger("amount") ?? 0;

		if (recipient.id === senderId) {
			await ix.reply({
				content: "❌ You can’t transfer cookies to yourself!",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		try {
			// Fetch both users or create defaults
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

			if (sender.cookies < amount) {
				await ix.reply({
					content: `❌ You only have **${sender.cookies}** cookies — not enough to send ${amount}.`,
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			// Ensure recipient exists
			await prisma.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: recipient.id } },
				update: {},
				create: {
					guildId,
					userId: recipient.id,
					cookies: 0,
					lastCookieAttempt: new Date(),
				},
			});

			// Perform both updates in a transaction
			await prisma.$transaction([
				prisma.cookiesUser.update({
					where: { guildId_userId: { guildId, userId: senderId } },
					data: { cookies: { decrement: amount } },
				}),
				prisma.cookiesUser.update({
					where: { guildId_userId: { guildId, userId: recipient.id } },
					data: { cookies: { increment: amount } },
				}),
			]);

			await ix.reply({
				content: `🍪 <@${senderId}> gave **${amount} cookie${amount === 1 ? "" : "s"}** to ${recipient.toString()}! 🍪`
			});
		} catch (error) {
			console.error("Error transferring cookies:", error);
			await ix.reply({
				content: "❌ Something went wrong while transferring cookies. Please try again later.",
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};
