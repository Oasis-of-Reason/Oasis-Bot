// src/commands/eventAttendanceLeaderboard.ts
import { MessageFlags, SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../utils/prisma";
import { TrackedInteraction } from "../utils/interactionSystem";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("event-attendance-leaderboard")
		.setDescription("Show the top 20 users by event attendance in this server.")
		.addBooleanOption(o =>
			o
				.setName("include_discord")
				.setDescription("Include Discord events")
				.setRequired(false)
		)
		.addBooleanOption(o =>
			o
				.setName("include_vrchat")
				.setDescription("Include VRChat events")
				.setRequired(false)
		),

	async execute(ix: TrackedInteraction) {
		if (!ix.interaction.isChatInputCommand()) {
			await ix.reply({
				content: "❌ This command can only be used as a slash command.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const interaction = ix.interaction as ChatInputCommandInteraction;

		if (!interaction.guildId) {
			await ix.reply({
				content: "❌ This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const includeDiscord = interaction.options.getBoolean("include_discord") ?? true;
		const includeVrchat = interaction.options.getBoolean("include_vrchat") ?? true;

		if (!includeDiscord && !includeVrchat) {
			await ix.reply({
				content: "❌ You must include at least one event type.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		try {
			const allowedTypes: ("DISCORD" | "VRCHAT")[] = [];
			if (includeDiscord) allowedTypes.push("DISCORD");
			if (includeVrchat) allowedTypes.push("VRCHAT");

			const events = await prisma.event.findMany({
				where: {
					guildId: interaction.guildId,
					type: {
						in: allowedTypes,
					},
				},
				select: {
					hostId: true,
					signups: {
						select: {
							userId: true,
						},
					},
				},
			});

			const attendanceCounts = new Map<string, number>();

			for (const event of events) {
				const attendees = new Set<string>();

				if (event.hostId) {
					attendees.add(event.hostId);
				}

				for (const signup of event.signups) {
					attendees.add(signup.userId);
				}

				for (const userId of attendees) {
					attendanceCounts.set(
						userId,
						(attendanceCounts.get(userId) ?? 0) + 1
					);
				}
			}

			if (attendanceCounts.size === 0) {
				await ix.reply({
					content: "ℹ️ No event attendance data found for the selected event types in this server.",
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

			const totalAttendances = [...attendanceCounts.values()].reduce((sum, n) => sum + n, 0);

			const includedLabel =
				includeDiscord && includeVrchat
					? "Discord + VRChat"
					: includeDiscord
						? "Discord"
						: "VRChat";

			await ix.reply({
				content:
					`### 📊 Event Attendance Leaderboard\n` +
					`Top 20 users by total event attendance in this server.\n` +
					`Included event types: **${includedLabel}**\n\n` +
					lines.join("\n") +
					`\n\n**Total recorded attendances:** ${totalAttendances}`,
				flags: MessageFlags.Ephemeral,
			});
		} catch (error) {
			console.error("event-attendance-leaderboard error:", error);
			await ix.reply({
				content: "❌ Failed to build the attendance leaderboard.",
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};