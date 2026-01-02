// src/commands/cookie-tag-team.ts
import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { TrackedInteraction } from "../utils/interactionSystem";

const prisma = new PrismaClient();

// In-memory pending per guild
type Pending = { initiatorId: string; locked?: boolean };
const PENDING_BY_GUILD = new Map<string, Pending>();

const TARGET_ID = "289822517944778752"; // Shion
const SUCCESS_RATE = 0.8;                // keep your adjusted rate
const COOLDOWN_MS = 4 * 60 * 60 * 1000;  // 4 hours

function formatRemaining(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const parts = [];
	if (h) parts.push(`${h}h`);
	if (m) parts.push(`${m}m`);
	if (sec || (!h && !m)) parts.push(`${sec}s`);
	return parts.join(" ");
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-tag-team")
		.setDescription("Team up with someone to mug Shion. If successful, both get +1 and Shion loses 2 cookies."),

	async execute(ix: TrackedInteraction) {
		if (!ix.interaction.guild) {
			await ix.reply("❌ This command can only be used in a server.");
			return;
		}

		const guildId = ix.interaction.guild.id;
		const userId = ix.interaction.user.id;
		const now = new Date();

		// Ensure guild Cookies row exists
		await prisma.cookies.upsert({
			where: { id: guildId },
			update: {},
			create: { id: guildId },
		});

		// ---- Cooldown check helper
		const checkCooldown = async (uid: string): Promise<string | null> => {
			const row = await prisma.cookiesUser.findUnique({
				where: { guildId_userId: { guildId, userId: uid } },
				select: { lastCookieAttempt: true },
			});
			if (!row?.lastCookieAttempt) return null;
			const since = now.getTime() - new Date(row.lastCookieAttempt).getTime();
			if (since < COOLDOWN_MS) {
				return formatRemaining(COOLDOWN_MS - since);
			}
			return null;
		};

		const pending = PENDING_BY_GUILD.get(guildId);

		// --- Case 1: No pending -> user becomes initiator (but enforce cooldown)
		if (!pending) {
			const remaining = await checkCooldown(userId);
			if (remaining) {
				await ix.reply({content: `⏳ You can attempt a tag-team in **${remaining}**.`, flags: MessageFlags.Ephemeral});
				return;
			}

			// Set lastCookieAttempt for the initiator when they start the mugging
			await prisma.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId } },
				update: { lastCookieAttempt: now },
				create: { guildId, userId, cookies: 0, lastCookieAttempt: now },
			});

			PENDING_BY_GUILD.set(guildId, { initiatorId: userId });

			await ix.reply(
				`> 🕵️ <@${userId}> is looking for an **accomplice** to mug Shion! ` +
				`Run **/cookie-tag-team** to join the heist. 🍪`
			);
			return;
		}

		// --- Case 2: Pending exists
		if (pending.initiatorId === userId) {
			await ix.reply({content: "⏳ You already started this tag-team — wait for someone else to join!", flags: MessageFlags.Ephemeral});
			return;
		}

		if (pending.locked) {
			await ix.reply({content: "⏳ Someone else is already joining this tag-team. Try again shortly.", flags: MessageFlags.Ephemeral});
			return;
		}

		// Enforce cooldown for the accomplice
		const remaining = await checkCooldown(userId);
		if (remaining) {
			await ix.reply({content: `⏳ You can attempt a tag-team in **${remaining}**.`, flags: MessageFlags.Ephemeral});
			return;
		}

		pending.locked = true;

		try {
			const initiatorId = pending.initiatorId;
			const accompliceId = userId;

			// Mark the accomplice's attempt time immediately (counts regardless of outcome)
			await prisma.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: accompliceId } },
				update: { lastCookieAttempt: now },
				create: { guildId, userId: accompliceId, cookies: 0, lastCookieAttempt: now },
			});

			// Check Shion's cookies first (pre-check)
			const shionRow = await prisma.cookiesUser.findUnique({
				where: { guildId_userId: { guildId, userId: TARGET_ID } },
				select: { cookies: true },
			});
			const shionCookiesPre = shionRow?.cookies ?? 0;

			if (shionCookiesPre < 2) {
				await ix.reply(
					`> 🕵️ <@${initiatorId}> and <@${accompliceId}> tried to mug Shion... but Shion didn't have enough cookies. 💀`
				);
				return;
			}

			const success = Math.random() < SUCCESS_RATE;

			if (!success) {
				await ix.reply(
					`> 🚨 <@${initiatorId}> and <@${accompliceId}> tried to mug Shion but **failed**! Our scrappy shark is tougher than he looks!`
				);
				return;
			}

			// Success path: Shion must lose 2 cookies; each partner gets +1.
			const result = await prisma.$transaction(async (tx) => {
				// Re-check Shion atomically
				const shion = await tx.cookiesUser.findUnique({
					where: { guildId_userId: { guildId, userId: TARGET_ID } },
					select: { cookies: true },
				});

				const currentShionCookies = shion?.cookies ?? 0;
				if (currentShionCookies < 2) {
					throw new Error("SHION_INSUFFICIENT_COOKIES");
				}

				const updatedShion = await tx.cookiesUser.upsert({
					where: { guildId_userId: { guildId, userId: TARGET_ID } },
					update: { cookies: { decrement: 2 } },
					create: { guildId, userId: TARGET_ID, cookies: 0, lastCookieAttempt: new Date(0) },
					select: { cookies: true },
				});

				const [initUpsert, accompUpsert] = await Promise.all([
					tx.cookiesUser.upsert({
						where: { guildId_userId: { guildId, userId: initiatorId } },
						update: { cookies: { increment: 1 } },
						create: { guildId, userId: initiatorId, cookies: 1, lastCookieAttempt: now },
						select: { cookies: true },
					}),
					tx.cookiesUser.upsert({
						where: { guildId_userId: { guildId, userId: accompliceId } },
						update: { cookies: { increment: 1 } },
						create: { guildId, userId: accompliceId, cookies: 1, lastCookieAttempt: now },
						select: { cookies: true },
					}),
				]);

				return {
					shionCookies: updatedShion.cookies,
					initiatorCookies: initUpsert.cookies,
					accompliceCookies: accompUpsert.cookies,
				};
			});

			await ix.reply(
				`> <@${initiatorId}> and <@${accompliceId}> **successfully mugged** Shion! 🍪\n` +
				`> Shion loses **2 cookies**. Each accomplice gains **+1 cookie**.\n` +
				`> 🍪 **New totals:** <@${initiatorId}>: ${result.initiatorCookies}, <@${accompliceId}>: ${result.accompliceCookies}\n` +
				`> Shion now has **${result.shionCookies}** cookies.`
			);
		} catch (err: any) {
			if (err?.message === "SHION_INSUFFICIENT_COOKIES") {
				await ix.reply(
					`> 🕵️ The mugging fizzled — Shion's cookie stash dropped below **2** right before the heist.`
				);
			} else {
				console.error("cookie-tag-team error:", err);
				await ix.reply("❌ Something went wrong resolving the tag-team mug.");
			}
		} finally {
			PENDING_BY_GUILD.delete(guildId);
		}
	},
};
