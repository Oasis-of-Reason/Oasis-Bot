import {
	SlashCommandBuilder,
	MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { TrackedInteraction } from "../utils/interactionSystem";

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-leaderboard")
		.setDescription("View the top 10 cookie-havers in this server."),

	async execute(ix: TrackedInteraction) {
		if (!ix.interaction.guild) {
			await ix.reply({
				content: "❌ This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const guildId = ix.interaction.guild.id;

		try {
			await ix.deferReply({ ephemeral: true });

			// Get top 10 users by cookies for this guild
			const top = await prisma.cookiesUser.findMany({
				where: { guildId },
				orderBy: [
					{ cookies: "desc" },
					{ userId: "asc" }, // stable order for ties
				],
				take: 10,
			});

			if (top.length === 0 || top.every(u => (u.cookies ?? 0) === 0)) {
				await ix.editReply("🍪 No cookies have been earned yet. Be the first!");
				return;
			}

			// Try to fetch member display names; fall back to mentions if missing
			const ids = top.map(u => u.userId);
			let names = new Map<string, string>();

			try {
				const members = await ix.interaction.guild.members.fetch({ user: ids });
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
				return `> ${prefix}  ${label} — **${u.cookies}**`;
			});

			const content =
				`**🍪 Cookie Leaderboard — Top 10**\n` +
				lines.join("\n");

			await ix.editReply({ content });
		} catch (error) {
			console.error("Error fetching cookie leaderboard:", error);
			await ix.editReply("❌ Could not fetch the leaderboard. Please try again later.");
		}
	},
};
