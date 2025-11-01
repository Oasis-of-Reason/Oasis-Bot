// src/commands/StealCookie.ts
import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
	TextChannel,
	ThreadChannel,
} from "discord.js";
import { prisma } from "../utils/prisma";
import { formatRemaining } from "../helpers/generalHelpers";

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

module.exports = {
	data: new SlashCommandBuilder()
		.setName("cookie-steal")
		.setDescription("Attempt to steal a cookie from Shion (50% success, 4h cooldown)"),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) {
			await interaction.reply({ content: "❌ This command can only be used in a server.", flags: MessageFlags.Ephemeral });
			return;
		}

		const guildId = interaction.guildId!;
		const targetId = "289822517944778752";
		const thiefId = interaction.user.id;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		// Ensure guild Cookies row exists
		await prisma.cookies.upsert({
			where: { id: guildId },
			update: {},
			create: { id: guildId },
		});

		// Check thief cooldown (read outside tx to avoid holding locks)
		const thiefRow = await prisma.cookiesUser.findUnique({
			where: { guildId_userId: { guildId, userId: thiefId } },
			select: { lastCookieAttempt: true },
		});

		const now = new Date();
		if (thiefRow?.lastCookieAttempt) {
			const since = now.getTime() - new Date(thiefRow.lastCookieAttempt).getTime();
			if (since < COOLDOWN_MS) {
				const remaining = COOLDOWN_MS - since;
				await interaction.editReply({ content: `⏳ You can attempt a steal in **${formatRemaining(remaining)}**.` });
				return;
			}
		}

		try {
			// Interactive transaction to check target cookies and perform transfer + update thief attempt atomically
			const reverseSteal = Math.random() < 0.1;
			const result = reverseSteal ? await stealCookieReverse(guildId, thiefId, targetId) : await stealCookie(guildId, targetId, thiefId);

			const ch = interaction.channel;
			if (!ch || !(ch instanceof TextChannel || ch instanceof ThreadChannel)) {
				await interaction.editReply({ content: "✅ Cookie recorded, but I couldn't post to this channel." });
				return;
			}
			if (reverseSteal) {
				// Announce publicly in the channel
				if (result.transferHappened) {
					await ch.send({
						content: `> 🦈 Shion with flawless dexterity **countered!** And stole a cookie from <@${thiefId}>! 🍪\n` +
							`> <@${thiefId}> now has **${result.targetCookies}** cookies. ` +
							`Shion now has **${result.thiefCookies}** cookies.`,
						allowedMentions: { users: [thiefId, targetId] },
					});
					await interaction.editReply({ content: "❌ Steal Countered!." });
				} else {
					// success==true but transferHappened==false implies target had no cookies
					await ch.send({
						content: `> 🦈 Shion **countered** but found <@${thiefId}> had no cookies to steal, what a cookieless bum.`,
						allowedMentions: { users: [thiefId] },
					});
					await interaction.editReply({ content: "❌ Steal failed." });
				}
			} else {
				// Announce publicly in the channel
				if (result.transferHappened) {
					await ch.send({
						content: `> 🕵️‍♂️ <@${thiefId}> **successfully stole** a cookie from Shion! 🍪\n` +
							`> <@${thiefId}> now has **${result.thiefCookies}** cookies. ` +
							`Shion now has **${result.targetCookies}** cookies.`,
						allowedMentions: { users: [thiefId, targetId] },
					});
					await interaction.editReply({ content: "✅ Steal Succeeded!." });
				} else {
					// failed steal (either RNG fail, or target had no cookies)
					if (!result.success && result.targetHasCookies) {
						await ch.send({
							content: `> ❌ <@${thiefId}> attempted to steal a cookie but Shion guarded fiercely. Better luck next time!`,
							allowedMentions: { users: [thiefId] },
						});
					} else {
						// success==true but transferHappened==false implies target had no cookies
						await ch.send({
							content: `> ❌ <@${thiefId}> tried to steal from Shion, but they have no cookies to steal.`,
							allowedMentions: { users: [thiefId] },
						});
					}
					await interaction.editReply({ content: "❌ Steal failed." });
				}
			}
		} catch (err) {
			console.error("steal-cookie failed:", err);
			await interaction.editReply({ content: "❌ Something went wrong while attempting the steal." });
		}
	},
};

async function stealCookie(guildId: string, targetId: string, thiefId: string): Promise<any> {
	const now = new Date();
	return await prisma.$transaction(async (tx) => {
		// Fetch target and thief inside transaction
		const targetRow = await tx.cookiesUser.findUnique({
			where: { guildId_userId: { guildId, userId: targetId } },
			select: { cookies: true },
		});

		// Ensure thief row exists for safe increment
		const existingThief = await tx.cookiesUser.findUnique({
			where: { guildId_userId: { guildId, userId: thiefId } },
			select: { cookies: true },
		});

		// We'll always update thief.lastCookieAttempt (counts attempt)
		// Determine success (50% chance)
		const success = Math.random() < 0.5;

		// If target has zero cookies, automatic failure but still counts as attempt
		const targetHasCookies = (targetRow?.cookies ?? 0) > 0;
		let transferHappened = false;
		let updatedThiefCookies = existingThief?.cookies ?? 0;
		let updatedTargetCookies = targetRow?.cookies ?? 0;

		if (success && targetHasCookies) {
			// Do the transfer: decrement target, increment thief (use upsert with increments)
			// Update target
			await tx.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: targetId } },
				update: { cookies: { decrement: 1 } },
				create: { guildId, userId: targetId, cookies: 0, lastCookieAttempt: new Date(0) }, // if created now -> 0 (can't go negative)
			});

			// Update thief (increment)
			const thiefUpsert = await tx.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: thiefId } },
				update: { cookies: { increment: 1 }, lastCookieAttempt: now },
				create: { guildId, userId: thiefId, cookies: 1, lastCookieAttempt: now },
			});

			updatedThiefCookies = thiefUpsert.cookies;
			updatedTargetCookies = (targetRow?.cookies ?? 1) - 1; // targetRow cookies minus 1
			transferHappened = true;
		} else {
			// No transfer — still update thief.lastCookieAttempt (create row if necessary)
			const thiefUpsert = await tx.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: thiefId } },
				update: { lastCookieAttempt: now },
				create: { guildId, userId: thiefId, cookies: 0, lastCookieAttempt: now },
			});
			updatedThiefCookies = thiefUpsert.cookies;
			updatedTargetCookies = targetRow?.cookies ?? 0;
		}

		return {
			success,
			transferHappened,
			targetHasCookies,
			thiefCookies: updatedThiefCookies,
			targetCookies: updatedTargetCookies,
		};
	}); // end transaction
}

async function stealCookieReverse(guildId: string, targetId: string, thiefId: string): Promise<any> {

	return await prisma.$transaction(async (tx) => {
		// Fetch target and thief inside transaction
		const targetRow = await tx.cookiesUser.findUnique({
			where: { guildId_userId: { guildId, userId: targetId } },
			select: { cookies: true },
		});

		// Ensure thief row exists for safe increment
		const existingThief = await tx.cookiesUser.findUnique({
			where: { guildId_userId: { guildId, userId: thiefId } },
			select: { cookies: true },
		});

		const targetHasCookies = (targetRow?.cookies ?? 0) > 0;
		let transferHappened = false;
		let updatedThiefCookies = existingThief?.cookies ?? 0;
		let updatedTargetCookies = targetRow?.cookies ?? 0;

		if (targetHasCookies) {
			// Do the transfer: decrement target, increment thief (use upsert with increments)
			// Update target
			await tx.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: targetId } },
				update: { cookies: { decrement: 1 } },
				create: { guildId, userId: targetId, cookies: 0, lastCookieAttempt: new Date(0) }, // if created now -> 0 (can't go negative)
			});

			// Update thief (increment)
			const thiefUpsert = await tx.cookiesUser.upsert({
				where: { guildId_userId: { guildId, userId: thiefId } },
				update: { cookies: { increment: 1 } },
				create: { guildId, userId: thiefId, cookies: 1, lastCookieAttempt: new Date(0) },
			});

			updatedThiefCookies = thiefUpsert.cookies;
			updatedTargetCookies = (targetRow?.cookies ?? 1) - 1; // targetRow cookies minus 1
			transferHappened = true;
		}

		return {
			success: true,
			transferHappened,
			targetHasCookies,
			thiefCookies: updatedThiefCookies,
			targetCookies: updatedTargetCookies,
		};
	}); // end transaction
}