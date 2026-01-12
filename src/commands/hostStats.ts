import {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	GuildMember,
	MessageFlags,
} from "discord.js";

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import {
	userHasAllowedRole,
	getStandardRolesOrganizer,
} from "../helpers/securityHelpers";
import { TrackedInteraction } from "../utils/interactionSystem";

export const data = new SlashCommandBuilder()
	.setName("host-stats")
	.setDescription("Shows event stats grouped by host (restricted)");

export async function execute(ix: TrackedInteraction) {
	// --- Permission Check ---
	const canSee = userHasAllowedRole(
		ix.interaction.member as GuildMember,
		getStandardRolesOrganizer()
	);

	if (!canSee) {
		return ix.reply({
			content: "You do not have permission to run this.",
			flags: MessageFlags.Ephemeral,
		});
	}

	// --- Defer reply immediately (ephemeral) ---
	await ix.deferReply({ ephemeral: true });

	const guildId = ix.guildId!;
	const guild = ix.interaction.guild!;

	// --- Fetch all events for this guild ---
	const events = await prisma.event.findMany({
		where: { guildId },
		orderBy: { startTime: "desc" },
	});

	if (events.length === 0) {
		return ix.editReply({
			content: "No events found for this guild.",
		});
	}

	// --- Group events by host ---
	const hostMap: Record<string, { count: number; lastEvent: Date }> = {};

	for (const ev of events) {
		const hostId = ev.hostId;
		if (!hostMap[hostId]) {
			hostMap[hostId] = { count: 0, lastEvent: ev.startTime };
		}
		hostMap[hostId].count++;
		if (ev.startTime > hostMap[hostId].lastEvent) {
			hostMap[hostId].lastEvent = ev.startTime;
		}
	}

	// --- Resolve usernames in parallel ---
	const today = new Date();
	const rows = await Promise.all(
		Object.keys(hostMap).map(async (hostId) => {
			let username = "Unknown User";
			let leftGuild = false;

			const member = await guild.members.fetch(hostId).catch(() => null);
			if (member) {
				username = member.user.displayName;
			} else {
				const user = await ix.interaction.client.users.fetch(hostId).catch(() => null);
				if (user) username = user.username;
				leftGuild = true;
			}

			const { count, lastEvent } = hostMap[hostId];

			const dd = String(lastEvent.getUTCDate()).padStart(2, "0");
			const mm = String(lastEvent.getUTCMonth() + 1).padStart(2, "0");
			const yyyy = lastEvent.getUTCFullYear();
			const hh = String(lastEvent.getUTCHours()).padStart(2, "0");
			const min = String(lastEvent.getUTCMinutes()).padStart(2, "0");
			const formattedDate = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

			let daysAgoNum = Math.floor((today.getTime() - lastEvent.getTime()) / (1000 * 60 * 60 * 24));
			let daysAgoText = daysAgoNum >= 0 ? `${String(daysAgoNum)} days ago` : `in ${Math.abs(daysAgoNum)} days`;

			return { username, count, formattedDate, daysAgoText, leftGuild };
		})
	);

	// --- Sort by most recent last event ---
	rows.sort(
		(a, b) =>
			new Date(b.formattedDate).getTime() - new Date(a.formattedDate).getTime()
	);

	// --- Build table output ---
	const header = "Host               | Events | Last Event        | Days Ago ";
	const separator = "-------------------+--------+-------------------+-----------";
	const lines = [header, separator];

	for (const r of rows) {
		const notes = r.leftGuild ? "left guild" : "";
		lines.push(
			`${r.username.padEnd(18)} | ${String(r.count).padEnd(6)} | ${r.formattedDate.padEnd(
				17
			)} | ${String(r.daysAgoText).padEnd(7)} | ${notes}`
		);
	}

	const output = "```\n" + lines.join("\n") + "\n```";

	// --- Split into multiple messages if needed (Discord 2000 char limit) ---
	const maxCharsPerMessage = 2000;
	const messages: string[] = [];

	if (output.length <= maxCharsPerMessage) {
		messages.push(output);
	} else {
		// Split while preserving code block formatting
		const contentLines = lines.slice(2); // Skip header and separator, we'll add them to each chunk
		let currentMessage = "```\n" + header + "\n" + separator + "\n";

		for (const line of contentLines) {
			const lineWithNewline = line + "\n";
			const messageIfAdded = currentMessage + lineWithNewline + "```";

			if (messageIfAdded.length > maxCharsPerMessage && currentMessage !== `\`\`\`\n${header}\n${separator}\n`) {
				// Adding this line would exceed limit, save current message and start new one
				currentMessage += "```";
				messages.push(currentMessage);
				currentMessage = "```\n" + header + "\n" + separator + "\n" + lineWithNewline;
			} else {
				currentMessage += lineWithNewline;
			}
		}

		// Add the final message
		currentMessage += "```";
		messages.push(currentMessage);
	}

	// --- Send the first message via editReply, then follow up with additional messages ---
	if (messages.length === 0) {
		return ix.editReply({
			content: "No data to display.",
		});
	}

	await ix.editReply({
		content: messages[0],
	});

	// Send additional messages if needed
	for (let i = 1; i < messages.length; i++) {
		await ix.followUp({
			content: messages[i],
			flags: MessageFlags.Ephemeral,
		});
	}

	return;
}
