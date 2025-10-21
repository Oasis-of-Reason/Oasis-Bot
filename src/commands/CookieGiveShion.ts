import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	TextChannel,
	ThreadChannel,
	MessageFlags,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { formatRemaining } from "../helpers/generalHelpers";

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-give")
		.setDescription("Give one cookie to a Shion (4h cooldown)"),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) {
			await interaction.reply({ content: "❌ This command can only be used in a server.", flags: MessageFlags.Ephemeral });
			return;
		}

		const guildId = interaction.guildId!;
		const receiverId = "289822517944778752"; // Shion
		const giverId = interaction.user.id;

		// ✅ Acknowledge immediately
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
					await interaction.editReply({
						content: `⏳ You can give a cookie in **${formatRemaining(remaining)}**.`,
					});
					return;
				}
			}

			// Transaction: increment receiver; set giver's last attempt
			const [receiverUpdated] = await prisma.$transaction([
				prisma.cookiesUser.upsert({
					where: { guildId_userId: { guildId, userId: receiverId } },
					update: { cookies: { increment: 1 } },
					create: { guildId, userId: receiverId, cookies: 1, lastCookieAttempt: new Date(0) },
				}),
				prisma.cookiesUser.upsert({
					where: { guildId_userId: { guildId, userId: giverId } },
					update: { lastCookieAttempt: now },
					create: { guildId, userId: giverId, cookies: 0, lastCookieAttempt: now },
				}),
			]);

			// Make sure channel supports send()
			const ch = interaction.channel;
			if (!ch || !(ch instanceof TextChannel || ch instanceof ThreadChannel)) {
				await interaction.editReply({ content: "✅ Cookie recorded, but I couldn't post to this channel." });
				return;
			}

			// Public announcement
			if (receiverId === giverId) {
				await ch.send({
					content: `🍪 <@${giverId}> got himself a cookie! His greed knows no bounds! They now have **${receiverUpdated.cookies}** cookies.`,
					allowedMentions: { users: [giverId] },
				});
			} else {
				await ch.send({
					content: `🍪 Shion has received a cookie from <@${giverId}>! They now have **${receiverUpdated.cookies}** cookies.`,
					allowedMentions: { users: [giverId] },
				});
			}

			// Finalize ephemeral confirmation (or delete it if you prefer no ephemeral)
			await interaction.editReply({ content: "✅ Cookie sent!" });
			// If you want no ephemeral at all:
			// await interaction.deleteReply().catch(() => {});
		} catch (err) {
			console.error("cookie-give failed:", err);
			await interaction.editReply({ content: "❌ Something went wrong while giving the cookie." });
		}
	},
};
