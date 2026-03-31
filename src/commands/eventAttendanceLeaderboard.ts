// src/commands/eventAttendanceLeaderboard.ts
import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../utils/prisma";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("event-attendance-leaderboard")
		.setDescription("Show the top 20 users by event attendance in this server."),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guildId) {
			await interaction.reply({
				content: "❌ This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		try {
			const events = await prisma.event.findMany({
				where: {
					guildId: interaction.guildId,
				},
				select: {
					signups: {
						select: {
							userId: true,
						},
					},
				},
			});

			const attendanceCounts = new Map<string, number>();

			for (const event of events) {
				for (const signup of event.signups) {
					attendanceCounts.set(
						signup.userId,
						(attendanceCounts.get(signup.userId) ?? 0) + 1
					);
				}
			}

			if (attendanceCounts.size === 0) {
				await interaction.reply({
					content: "ℹ️ No event attendance data found for this server.",
					flags: MessageFlags.Ephemeral,
				});
				return;
			}

			const topUsers = [...attendanceCounts.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 20);

			const lines = topUsers.map(([userId, count], index) => {
				return `**${index + 1}.** <@${userId}> — **${count}** attendance${count === 1 ? "" : "s"}`;
			});

			const totalSignups = [...attendanceCounts.values()].reduce((sum, n) => sum + n, 0);

			await interaction.reply({
				content:
					`### 📊 Event Attendance Leaderboard\n` +
					`Top 20 users by total event signups in this server.\n\n` +
					lines.join("\n") +
					`\n\n**Total recorded attendances:** ${totalSignups}`,
				flags: MessageFlags.Ephemeral,
			});
		} catch (error) {
			console.error("event-attendance-leaderboard error:", error);
			await interaction.reply({
				content: "❌ Failed to build the attendance leaderboard.",
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};