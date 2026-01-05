import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	TextChannel,
	ThreadChannel,
	MessageFlags,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { formatRemaining } from "../helpers/generalHelpers";
import { TrackedInteraction } from "../utils/interactionSystem";

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-give")
		.setDescription("Give one cookie to a Shion (4h cooldown)"),

	async execute(ix: TrackedInteraction) {
		if (!ix.interaction.guild) {
			await ix.reply({ content: "❌ This command can only be used in a server.", flags: MessageFlags.Ephemeral });
			return;
		}

		const guildId = ix.guildId!;
		const receiverId = "289822517944778752"; // Shion
		const giverId = ix.interaction.user.id;

		try {
			// Ensure guild Cookies row exists
			await prisma.cookies.upsert({
				where: { id: guildId },
				update: {},
				create: { id: guildId },
			});

			// Cooldown check for giver
			const giverRow = await prisma.cookiesUser.findUnique({
				where: { guildId_userId: { guildId, userId: giverId } },
				select: { lastCookieAttempt: true },
			});

			const now = new Date();
			if (giverRow?.lastCookieAttempt) {
				const since = now.getTime() - new Date(giverRow.lastCookieAttempt).getTime();
				if (since < COOLDOWN_MS) {
					const remaining = COOLDOWN_MS - since;
					await ix.reply({
						content: `⏳ You can give a cookie in **${formatRemaining(remaining)}**.`, flags: MessageFlags.Ephemeral
					});
					return;
				}
			}

			const rand = Math.random();

			let cookieAmount = 1;
			if (rand > 0.95) {
				cookieAmount = 10;
			}

			// Transaction: increment receiver; set giver's last attempt
			const [receiverUpdated] = await prisma.$transaction([
				prisma.cookiesUser.upsert({
					where: { guildId_userId: { guildId, userId: receiverId } },
					update: { cookies: { increment: cookieAmount } },
					create: { guildId, userId: receiverId, cookies: cookieAmount, lastCookieAttempt: new Date(0) },
				}),
				prisma.cookiesUser.upsert({
					where: { guildId_userId: { guildId, userId: giverId } },
					update: { lastCookieAttempt: now },
					create: { guildId, userId: giverId, cookies: 0, lastCookieAttempt: now },
				}),
			]);

			let cookieSuccessMessage = `> 🍪 Shion has received a cookie from <@${giverId}>! They now have **${receiverUpdated.cookies}** cookies.`;
			if (receiverId === giverId) {
				if (rand > 0.95) {
					cookieSuccessMessage = `> 🍪 <@${giverId}> got himself a cookie! They now have **${receiverUpdated.cookies}** cookies.`
				} else {

					cookieSuccessMessage = `> 🍪 Shion has got himself an entire **PACK** of cookies from <@${giverId}>! His greed knows no bounds! They now have **${receiverUpdated.cookies}** cookies.`
				}
			}
			else {
				if (rand > 0.95) {
					// Transaction: increment receiver; set giver's last attempt
					const [giverUpdated] = await prisma.$transaction([
						prisma.cookiesUser.update({
							where: { guildId_userId: { guildId, userId: giverId } },
							data: { cookies: { increment: 6 } }
						}),
					]);
					cookieSuccessMessage = `> 🍪 Shion has received an entire **PACK** of cookies from <@${giverId}>! How generous! They now have **${receiverUpdated.cookies}** cookies.\n`
						+ `> 🍪 In a **rare** moment of kindness, Shion shared **SIX** cookies from the pack with <@${giverId}>! They now have **${giverUpdated.cookies}** cookies.`
				}
			}

			// Make sure channel supports send()
			const ch = ix.interaction.channel;
			if (!ch || !(ch instanceof TextChannel || ch instanceof ThreadChannel)) {
				await ix.reply({ content: "✅ Cookie recorded, but I couldn't post to this channel.", flags: MessageFlags.Ephemeral });
				return;
			}

			// Public announcement
			await ix.reply({
				content: cookieSuccessMessage,
				allowedMentions: { users: [giverId] },
			});

		} catch (err) {
			console.error("cookie-give failed:", err);
			await ix.reply({ content: "❌ Something went wrong while giving the cookie.", flags: MessageFlags.Ephemeral });
		}
	},
};
