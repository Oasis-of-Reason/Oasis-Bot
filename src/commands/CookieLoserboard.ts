import {
	SlashCommandBuilder,
	MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-loserboard")
		.setDescription("View the top 10 cookie-losers in this server (most lost in gamba)."),

	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({
				content: "❌ This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const guildId = interaction.guild.id;

		try {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			// Get top 10 users by cookies lost for this guild
			const top = await prisma.cookiesUser.findMany({
				where: { guildId },
				orderBy: [
					{ mostCookiesLost: "desc" },
					{ userId: "asc" }, // stable order for ties
				],
				take: 10,
			});

			if (top.length === 0 || top.every(u => (u.mostCookiesLost ?? 0) === 0)) {
				await interaction.editReply("🍪 No cookies have been lost yet. Be the first!");
				return;
			}

			// Try to fetch member display names; fall back to mentions if missing
			const ids = top.map(u => u.userId);
			let names = new Map<string, string>();

			try {
				const members = await interaction.guild.members.fetch({ user: ids });
				for (const [id, m] of members) {
					names.set(id, m.displayName);
				}
			} catch {
				// Ignore; we'll fall back to mentions
			}

			const medals = ["🥇", "🥈", "🥉"];
			const lines = top.map((u, i) => {
				const rank = i + 1;
				const label =
					names.get(u.userId) ??
					`<@${u.userId}>`; // mention fallback if name not cached/fetchable
				const prefix = medals[i] ?? `#${rank}`;
				return `> ${prefix}  ${label} — **${u.mostCookiesLost}**`;
			});

			const content =
				`**🍪 Cookie Loserboard — Top 10 Losers**\n` +
				lines.join("\n");

			await interaction.editReply({ content });
		} catch (error) {
			console.error("Error fetching cookie loserboard:", error);
			await interaction.editReply("❌ Could not fetch the loserboard. Please try again later.");
		}
	},
};
