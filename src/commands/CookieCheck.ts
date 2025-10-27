import {
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("cookie-check")
    .setDescription("Check how many cookies you have."),

  async execute(interaction: any) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ This command can only be used inside a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    try {
      // Look up the user's cookie record
      const cookieUser = await prisma.cookiesUser.findUnique({
        where: {
          guildId_userId: { guildId, userId },
        },
      });

      const cookies = cookieUser?.cookies ?? 0;

      await interaction.reply({
        content: `🍪 You currently have **${cookies} cookie${cookies === 1 ? "" : "s"}**.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Error fetching cookie count:", error);
      await interaction.reply({
        content: "❌ Could not fetch your cookie count. Please try again later.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
