// src/commands/cookiePremium.ts
import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { oasisPremiumId } from "../helpers/generalConstants";
import { giveRoleToUser } from "../helpers/discordHelpers";

const prisma = new PrismaClient();
const COST = 50;

export const data = new SlashCommandBuilder()
	.setName("cookie-oasis-premium")
	.setDescription(`Spend ${COST} cookies to buy or extend Oasis Premium by 1 month.`)
	.addUserOption(o =>
		o
			.setName("gift_recipient")
			.setDescription("Target of gift for one month of Oasis Premium")
			.setRequired(false)
	);

export async function execute(interaction: ChatInputCommandInteraction) {
	if (!interaction.inGuild() || !interaction.guildId) {
		return interaction.reply({
			content: "❌ This command can only be used in a server.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const guildId = interaction.guildId;
	const purchaserId = interaction.user.id;
	const targetUser = interaction.options.getUser("gift_recipient", false);
	const recipientId = targetUser?.id ?? purchaserId;

	const result = await prisma.$transaction(async (tx) => {
		// Ensure guild Cookies row exists for FK
		await tx.cookies.upsert({
			where: { id: guildId },
			update: {},
			create: { id: guildId },
		});

		// Upsert purchaser (spender) row
		const purchaser = await tx.cookiesUser.upsert({
			where: { guildId_userId: { guildId, userId: purchaserId } },
			create: {
				guildId,
				userId: purchaserId,
				cookies: 0,
				lastCookieAttempt: new Date(0),
				mostCookiesLost: 0,
				oasisPremiumExpiration: new Date(0), // no sub yet
			},
			update: {},
			select: {
				id: true,
				cookies: true,
				oasisPremiumExpiration: true,
			},
		});

		if (purchaser.cookies < COST) {
			return {
				canBuy: false as const,
				currentCookies: purchaser.cookies,
			};
		}

		const now = new Date();

		// Upsert recipient row (could be same as purchaser or someone else)
		let recipient = purchaser;
		if (recipientId !== purchaserId) {
			recipient = await tx.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: recipientId } },
				create: {
					guildId,
					userId: recipientId,
					cookies: 0,
					lastCookieAttempt: new Date(0),
					mostCookiesLost: 0,
					oasisPremiumExpiration: new Date(0),
				},
				update: {},
				select: {
					id: true,
					cookies: true,
					oasisPremiumExpiration: true,
				},
			});
		}

		const baseDate =
			recipient.oasisPremiumExpiration && recipient.oasisPremiumExpiration > now
				? recipient.oasisPremiumExpiration
				: now;

		const newExpiration = addMonths(baseDate, 1);
		const wasExtended = recipient.oasisPremiumExpiration > now;

		// Update purchaser cookies and recipient expiration
		let newCookiesForPurchaser: number;
		let finalExpiration: Date;

		if (recipientId === purchaserId) {
			// Same user: do both updates in a single query
			const updated = await tx.cookiesUser.update({
				where: { id: purchaser.id },
				data: {
					cookies: { decrement: COST },
					oasisPremiumExpiration: newExpiration,
				},
				select: {
					cookies: true,
					oasisPremiumExpiration: true,
				},
			});
			newCookiesForPurchaser = updated.cookies;
			finalExpiration = updated.oasisPremiumExpiration;
		} else {
			// Different users: update separately
			const updatedPurchaser = await tx.cookiesUser.update({
				where: { id: purchaser.id },
				data: {
					cookies: { decrement: COST },
				},
				select: {
					cookies: true,
				},
			});

			const updatedRecipient = await tx.cookiesUser.update({
				where: { id: recipient.id },
				data: {
					oasisPremiumExpiration: newExpiration,
				},
				select: {
					oasisPremiumExpiration: true,
				},
			});

			newCookiesForPurchaser = updatedPurchaser.cookies;
			finalExpiration = updatedRecipient.oasisPremiumExpiration;
		}

		return {
			canBuy: true as const,
			newCookies: newCookiesForPurchaser,
			newExpiration: finalExpiration,
			wasExtended,
			recipientId,
		};
	});

	if (!result.canBuy) {
		return interaction.reply({
			content: `❌ You need **${COST} cookies** to buy/extend Oasis Premium, but you only have **${result.currentCookies}**.`,
			flags: MessageFlags.Ephemeral,
		});
	}

	// Give premium role to the recipient
	const status = await giveRoleToUser(interaction.guild!, result.recipientId, oasisPremiumId);
	if (status !== "ok") {
		console.error("Failed to give premium role:", status);
		// We won't fail the whole command, but we can mention it optionally
	}

	const expiresTs = Math.floor(result.newExpiration.getTime() / 1000); // for Discord timestamp
	const modeText = result.wasExtended
		? "1 additional month of Oasis Premium"
		: "an Oasis Premium Subscription for 1 month";

	const isGift = !!targetUser?.id;
	const recipientMention = `<@${result.recipientId}>`;

	return interaction.reply({
		content:
			isGift
				? `✅ Congratulations ${recipientMention}! <@${interaction.user.id}> has bought you **${modeText}**!\n` +
				  `> New expiration: <t:${expiresTs}:f> (<t:${expiresTs}:R>)`
				: `✅ You have bought **${modeText}** for yourself!\n` +
				  `> New expiration: <t:${expiresTs}:f> (<t:${expiresTs}:R>)\n` +
				  `> Cookies remaining: **${result.newCookies}** 🍪`,
	});
}

// Safely add months while handling month-end edge cases
function addMonths(date: Date, months: number): Date {
	const d = new Date(date.getTime());
	const day = d.getDate();

	d.setMonth(d.getMonth() + months);

	// If we rolled over (e.g., Jan 31 -> Mar 3), snap to last day of previous month
	if (d.getDate() < day) {
		d.setDate(0);
	}

	return d;
}
