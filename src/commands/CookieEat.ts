// src/commands/EatCookie.ts
import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
	TextChannel,
	ThreadChannel,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { incrementCookieRage } from "../helpers/cookieHelpers";
import { cookieUpdatesMentionString } from "../helpers/generalConstants";

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
				await interaction.reply({ content: "✅ Cookie recorded, but I couldn't post to this channel.", flags: MessageFlags.Ephemeral });
				return;
			}

			if (res.count === 0) {
				// Either no row or zero cookies — make sure a row exists for future operations
				await prisma.cookiesUser.upsert({
					where: { guildId_userId: { guildId, userId } },
					update: {}, // already 0; nothing to change
					create: { guildId, userId, cookies: 0, lastCookieAttempt: new Date(0) },
				});

				await interaction.reply({ content: "😕 You don’t have any cookies to eat.", flags: MessageFlags.Ephemeral });
				return;
			}

			// Fetch updated count to report
			const updated = await prisma.cookiesUser.findUnique({
				where: { guildId_userId: { guildId, userId } },
				select: { cookies: true },
			});

			const remaining = updated?.cookies ?? 0;

			const rage = await incrementCookieRage(guildId);
			const rand = randomInt(10, 30); // 0 or 1
			if (rage > rand) {
				const result = await shionRampage(interaction.guildId!);
				const guild = interaction.guild!;
				const memberIds = result.victims.map(v => v.userId);

				// Bulk fetch members (one request)
				const members = await guild.members.fetch({ user: memberIds });

				// Build lines using display names
				const victimLines = result.victims
					.map(v => {
						const member = members.get(v.userId);
						const name = member?.displayName ?? member?.user.username ?? "Unknown User";
						return `• **${name}** lost **${v.stolen}** cookies`;
					})
					.join("\n");
				await interaction.reply(
					`${cookieUpdatesMentionString}\n` +
					`🦈 **SHION RAMPAGE!** He stole a total of **${result.totalStolen}** cookies.\n` +
					`${victimLines}\n\n` +
					`Shion now has **${result.shionCookies}** cookies.`
				);
				return
			}

			await interaction.reply({
				content: `> <@${userId}> just ate a cookie in front of Shion, are you mad?! 🍪 They now have **${remaining}** cookie${remaining === 1 ? "" : "s"} left.\n` +
					`> Shion's mood: _` + getShionRageText(rage) + `_`,
				allowedMentions: { users: [userId] },
			});

		} catch (err) {
			console.error("eat-cookie failed:", err);
			await interaction.reply({ content: "❌ Something went wrong while eating your cookie.", flags: MessageFlags.Ephemeral });
		}
	},
};

export function getShionRageText(rage: number): string {
	switch (true) {
		case rage <= 0:
			return "🦈 Shion seems calm... for now. 🦈";

		case rage <= 3:
			return "🦈 Shion grumbles quietly... 🦈";

		case rage <= 6:
			return "🦈 Shion slaps his tail against the ground. He's getting irritated. 🦈";

		case rage <= 8:
			return "🦈 Shion narrows his eyes. The water around him ripples with annoyance. 🦈";

		case rage <= 10:
			return "🦈 Shion bares his teeth. You feel an ominous shift in the current. 🦈";

		case rage <= 13:
			return "🦈 Shion thrashes aggressively. Everyone takes a nervous step back. 🦈";

		case rage <= 16:
			return "🦈 Shion is foaming with fury — the whole room is shaking. 🦈";

		case rage <= 50:
			return "🦈 **Shion is moments away from going on a full rampage.** His roar echoes through the depths. 🦈";

		default:
			return "🦈 **oops.** 🦈";
	}
}


const SHION_ID = "289822517944778752";

type RampageResult = {
	victims: { userId: string; stolen: number }[];
	totalStolen: number;
	shionCookies: number;
};

export async function shionRampage(guildId: string): Promise<RampageResult> {
	return await prisma.$transaction(async (tx) => {
		// Ensure Cookies row exists
		await tx.cookies.upsert({
			where: { id: guildId },
			update: {},
			create: { id: guildId },
		});

		// All possible victims: non-Shion users with > 0 cookies
		const candidates = await tx.cookiesUser.findMany({
			where: {
				guildId,
				userId: { not: SHION_ID },
				cookies: { gt: 0 },
			},
			select: {
				userId: true,
				cookies: true,
			},
		});

		if (candidates.length === 0) {
			// Still reset rage even if nobody had cookies
			await tx.cookies.update({
				where: { id: guildId },
				data: { CookieRageCounter: 0 },
			});

			// Make sure Shion row exists (no extra cookies)
			const shionRow = await tx.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: SHION_ID } },
				update: {},
				create: {
					guildId,
					userId: SHION_ID,
					cookies: 0,
					lastCookieAttempt: new Date(0),
				},
				select: { cookies: true },
			});

			return {
				victims: [],
				totalStolen: 0,
				shionCookies: shionRow.cookies,
			};
		}

		// Shuffle candidates and pick up to 6
		shuffleInPlace(candidates);
		const selected = candidates.slice(0, 6);

		const victims: { userId: string; stolen: number }[] = [];
		let totalStolen = 0;

		// Decide how much to steal from each victim
		for (const victim of selected) {
			const maxSteal = Math.min(victim.cookies, 10);
			if (maxSteal <= 0) continue;

			const amount = randomInt(1, maxSteal);
			if (amount <= 0) continue;

			victims.push({ userId: victim.userId, stolen: amount });
			totalStolen += amount;
		}

		// Apply decrements to each victim
		for (const v of victims) {
			await tx.cookiesUser.update({
				where: { guildId_userId: { guildId, userId: v.userId } },
				data: {
					cookies: { decrement: v.stolen },
				},
			});
		}

		// Give stolen cookies to Shion
		const shionRow = await tx.cookiesUser.upsert({
			where: { guildId_userId: { guildId, userId: SHION_ID } },
			update: {
				cookies: { increment: totalStolen },
			},
			create: {
				guildId,
				userId: SHION_ID,
				cookies: totalStolen,
				lastCookieAttempt: new Date(0),
			},
			select: { cookies: true },
		});

		// Reset rage counter
		await tx.cookies.update({
			where: { id: guildId },
			data: { CookieRageCounter: 0 },
		});

		return {
			victims,
			totalStolen,
			shionCookies: shionRow.cookies,
		};
	});
}

function randomInt(min: number, max: number): number {
	// inclusive [min, max]
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleInPlace<T>(arr: T[]): void {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
}

