// src/commands/EatCookie.ts
import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
	TextChannel,
	ThreadChannel,
} from "discord.js";
import { prisma } from "../../utils/prisma";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-eat")
		.setDescription("Eat one of your cookies (decrement your cookie count by 1)"),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) {
			await interaction.reply({
				content: "❌ This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const guildId = interaction.guildId!;
		const userId = interaction.user.id;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			// Ensure guild parent row exists (harmless if already there)
			await prisma.cookies.upsert({
				where: { id: guildId },
				update: {},
				create: { id: guildId },
			});

			// Atomically decrement ONLY if the user has at least 1 cookie
			const res = await prisma.cookiesUser.updateMany({
				where: { guildId, userId, cookies: { gte: 1 } },
				data: { cookies: { decrement: 1 } },
			});

			const ch = interaction.channel;
			if (!ch || !(ch instanceof TextChannel || ch instanceof ThreadChannel)) {
				await interaction.editReply({ content: "✅ Cookie recorded, but I couldn't post to this channel." });
				return;
			}

			if (res.count === 0) {
				// Either no row or zero cookies — make sure a row exists for future operations
				await prisma.cookiesUser.upsert({
					where: { guildId_userId: { guildId, userId } },
					update: {}, // already 0; nothing to change
					create: { guildId, userId, cookies: 0, lastCookieAttempt: new Date(0) },
				});

				await interaction.editReply({ content: "😕 You don’t have any cookies to eat." });
				await ch.send({
					content: `> <@${userId}> Tried to eat a cookie, but they don't have any! How sad! :(`,
					allowedMentions: { users: [userId] },
				});
				return;
			}

			// Fetch updated count to report
			const updated = await prisma.cookiesUser.findUnique({
				where: { guildId_userId: { guildId, userId } },
				select: { cookies: true },
			});

			const remaining = updated?.cookies ?? 0;


			// Public announcement
			await ch.send({
				content: `> 😋 <@${userId}> just ate a cookie! 🍪 They now have **${remaining}** cookie${remaining === 1 ? "" : "s"} left.`,
				allowedMentions: { users: [userId] },
			});
			await interaction.editReply({ content: "✅ You successfully ate a cookie." });

		} catch (err) {
			console.error("eat-cookie failed:", err);
			await interaction.editReply({ content: "❌ Something went wrong while eating your cookie." });
		}
	},
};
