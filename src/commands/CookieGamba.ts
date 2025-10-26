import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { randomInt } from "crypto";

const prisma = new PrismaClient();

export const data = new SlashCommandBuilder()
  .setName("cookie-gamba")
  .setDescription("Gamble ALL your cookies: 50% to double, 50% to lose them all.")

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild() || !interaction.guildId) {
    return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
  }

  const guildId = interaction.guildId;
  const userId = interaction.user.id;

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
      select: { id: true, cookies: true },
    });

    if (userRow.cookies <= 0) {
      return { canGamble: false } as const;
    }

    const win = randomInt(0, 2) === 1; // 0 or 1
    const before = userRow.cookies;
    const after = win ? before * 2 : 0;

    await tx.cookiesUser.update({
      where: { id: userRow.id },
      data: {
        cookies: after,
      },
    });

    return { canGamble: true, win, before, after } as const;
  });

  if (!result.canGamble) {
    return interaction.reply({
      content: "You have **0 cookies** — nothing to gamble. Earn some first! 🍪",
      ephemeral: true,
    });
  }

  if (result.win) {
    return interaction.reply(
      `> 🎉 **WIN!** <@${userId}> doubled their cookies from **${result.before} → ${result.after}**. Enjoy the crumbs of victory! 🍪`
    );
  } else {
    return interaction.reply(
      `> 💀 **LOSS!** <@${userId}> gambled **${result.before}** cookies and lost it all. Better luck next time…`
    );
  }
}
