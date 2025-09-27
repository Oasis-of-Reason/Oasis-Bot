import { SlashCommandBuilder, ChatInputCommandInteraction, InteractionReplyOptions } from "discord.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Send a reply safely: use editReply if already deferred/replied, fallback to followUp.
 * Pass ephemeral as true to send an ephemeral reply (uses flags for compatibility).
 */
async function safeReply(interaction: ChatInputCommandInteraction, content: string | InteractionReplyOptions, ephemeral = false) {
  const opts: InteractionReplyOptions = typeof content === "string" ? { content } : { ...(content as InteractionReplyOptions) };
  if (ephemeral) opts.flags = 64;

  try {
    if (interaction.deferred || interaction.replied) {
      // If we've already acknowledged the interaction, edit the original reply.
      return await interaction.editReply(opts as unknown as string).catch(() => interaction.followUp(opts));
    } else {
      // Otherwise send the initial reply.
      return await interaction.reply(opts);
    }
  } catch (err) {
    console.error("safeReply error:", err);
    // Best-effort fallback: try followUp if reply/editReply failed and we previously didn't reply.
    try {
      if (!interaction.replied && !interaction.deferred) return await interaction.reply(opts);
      return await interaction.followUp(opts);
    } catch {
      // give up silently; caller should handle logging if needed
      return null;
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shakeball')
    .setDescription('Interact with the Magic 8 Ball')
    .addSubcommand(sub =>
      sub.setName('ask')
        .setDescription('Get a prophecy from the Magic 8 Ball')
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a new prophecy')
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('The prophecy to add')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a prophecy by ID')
        .addIntegerOption(opt =>
          opt.setName('id')
            .setDescription('The ID of the prophecy to remove')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all prophecies')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'ask') {
      const all = await prisma.magic8BallProphecy.findMany({ select: { id: true, message: true } });
      if (all.length === 0) {
        await safeReply(interaction, "No prophecies found in the database!");
        return;
      }
      const picked = all[Math.floor(Math.random() * all.length)];
      await safeReply(interaction, picked?.message ?? "The spirits are silent...");
      return;
    }

    if (sub === 'add') {
      const message = interaction.options.getString('message', true);
      const created = await prisma.magic8BallProphecy.create({ data: { message } });
      await safeReply(interaction, `Added prophecy #${created.id}: "${created.message}"`);
      return;
    }

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id', true);
      try {
        const deleted = await prisma.magic8BallProphecy.delete({ where: { id } });
        await safeReply(interaction, `Removed prophecy #${id}: "${deleted.message}"`);
      } catch {
        await safeReply(interaction, `No prophecy found with ID ${id}.`);
      }
      return;
    }

    if (sub === 'list') {
      const all = await prisma.magic8BallProphecy.findMany();
      if (all.length === 0) {
        await safeReply(interaction, "No prophecies found.");
        return;
      }

      // chunk to avoid Discord 2000 char limit
      const lines = all.map((r: { id: any; message: any; }) => `${r.id}: ${r.message}`);
      let chunk = "";
      for (const line of lines) {
        if ((chunk + line + "\n").length > 1800) {
          await safeReply(interaction, chunk);
          chunk = line + "\n";
        } else {
          chunk += line + "\n";
        }
      }
      if (chunk) await safeReply(interaction, chunk);
      return;
    }
  },
};
