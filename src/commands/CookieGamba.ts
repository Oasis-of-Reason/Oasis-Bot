import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { randomInt } from "crypto";
import { TrackedInteraction } from "../utils/interactionSystem";

const prisma = new PrismaClient();
const juni = "1372336181492318241";

export const data = new SlashCommandBuilder()
	.setName("cookie-gamba")
	.setDescription("Gamble ALL your cookies: 50% to double, 50% to lose them all.")

export async function execute(ix: TrackedInteraction) {
	if (!ix.interaction.inGuild() || !ix.guildId) {
		return ix.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
	}

	const guildId = ix.guildId;
	const userId = ix.interaction.user.id;

	// Do the whole thing transactionally to avoid partial updates
	const result = await prisma.$transaction(async (tx) => {
		// Ensure the user row exists; if not, create with 0
		const userRow = await tx.cookiesUser.upsert({
			where: { guildId_userId: { guildId, userId } },
			create: {
				guildId,
				userId,
				lastCookieAttempt: new Date(0),
				cookies: 0,
			},
			update: {}, // no-op, just fetch existing
			select: { id: true, cookies: true, mostCookiesLost: true },
		});

		if (userRow.cookies <= 0) {
			return { canGamble: false } as const;
		}

		const win = randomInt(0, 2) === 1; // 0 or 1
		const before = userRow.cookies;
		const after = win ? before * 2 : 0;

		if (win) {
			await tx.cookiesUser.update({
				where: { id: userRow.id },
				data: {
					cookies: after,
				},
			});
		}
		else {
			// Only update mostCookiesLost if this loss is bigger than previous record
			const prevMost = userRow.mostCookiesLost ?? 0;
			const data: any = {
				cookies: after,
			};

			if (before > prevMost) {
				data.mostCookiesLost = before;
			}

			await tx.cookiesUser.update({
				where: { id: userRow.id },
				data,
			});
		}

		return { canGamble: true, win, before, after } as const;
	});

	if (!result.canGamble) {
		return ix.reply({
			content: "You have **0 cookies** — nothing to gamble. Earn some first! 🍪",
			flags: MessageFlags.Ephemeral,
		});
	}

	let winMessage = userId === juni ? `> 🎉 **WIN!** <@${userId}> is at it again? Keep going, we all know you can't help yourself... **${result.before} → ${result.after}**.🍪` :
		`> 🎉 **WIN!** <@${userId}> doubled their cookies from **${result.before} → ${result.after}**. Enjoy the crumbs of victory! 🍪`;
	let loseMessage = userId === juni ? `> 💀 **LOSS!** <@${userId}> gambled **${result.before}** cookies and lost it all. It's finally over.` :
		`> 💀 **LOSS!** <@${userId}> gambled **${result.before}** cookies and lost it all. Better luck next time…`;

	if (result.win) {
		return ix.reply(
			winMessage
		);
	} else {
		return ix.reply(
			loseMessage
		);
	}
}
