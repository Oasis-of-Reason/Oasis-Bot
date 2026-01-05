// src/commands/cookieGive.ts
import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	MessageFlags,
	CacheType,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { TrackedInteraction } from "../utils/interactionSystem";

const prisma = new PrismaClient();

export const data = new SlashCommandBuilder()
	.setName("cookie-give-admin")
	.setDescription("Give a user some cookies.")
	.addUserOption(o =>
		o.setName("user")
			.setDescription("The user who should receive cookies.")
			.setRequired(true)
	)
	.addIntegerOption(o =>
		o.setName("amount")
			.setDescription("Number of cookies to give.")
			.setRequired(true)
	)

export async function execute(ix: TrackedInteraction) {
	const interaction = ix.interaction as ChatInputCommandInteraction;
	if (!interaction.inGuild() || !ix.guildId) {
		return ix.reply({
			content: "❌ This command can only be used in a server.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const guildId = ix.guildId;
	const targetUser = interaction.options.getUser("user", true);
	const amount = interaction.options.getInteger("amount", true);

	if (amount <= 0) {
		return ix.reply({
			content: "❌ Amount must be **greater than zero**.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const userId = targetUser.id;

	const result = await prisma.$transaction(async (tx) => {
		// Ensure Cookies parent row exists
		await tx.cookies.upsert({
			where: { id: guildId },
			update: {},
			create: { id: guildId },
		});

		// Update / upssert the user
		const updated = await tx.cookiesUser.upsert({
			where: { guildId_userId: { guildId, userId } },
			update: { cookies: { increment: amount } },
			create: {
				guildId,
				userId,
				cookies: amount,
				lastCookieAttempt: new Date(0),
				mostCookiesLost: 0,
				oasisPremiumExpiration: new Date(0),
			},
			select: { cookies: true },
		});

		return updated.cookies;
	});

	await ix.reply(
		`🍪 **Gave ${amount} cookies** to <@${userId}>.\n` +
		`They now have **${result} cookies**!`
	);
}
