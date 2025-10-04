// src/commands/calender.ts
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, CacheType, MessageFlags } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { buildCalenderEmbed } from '../helpers/refreshCalender';

const prisma = new PrismaClient();



/**
 * Event line format:
 * "<@hostId> <t:unix:t> [**Title**](link) <t:unix:R> • 5/30 _(TYPE · SUBTYPE · SCOPE)_"
 */


module.exports = {
  data: new SlashCommandBuilder()
    .setName('calender')
    .setDescription('Show all upcoming events grouped by day (host + time + linked title + relative time + capacity)'),

  async execute(interaction: ChatInputCommandInteraction<CacheType>) {

    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server!', flags: MessageFlags.Ephemeral });
      return;
    }

    const now = new Date();
    const guildId = interaction.guildId;
    const events = await prisma.event.findMany({
      where: {
        guildId: guildId,
        startTime: { gte: now }
      },
      orderBy: { startTime: 'asc' },
      include: {
        _count: { select: { signups: true } },
      },
    });
  
    if (events.length === 0) {
      await interaction.reply('ℹ️ No upcoming events.');
      return;
    }

    try {
      const embed = buildCalenderEmbed(events, guildId);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error('Error fetching events:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ An error occurred while fetching events. Please try again.', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: '❌ An error occurred while fetching events. Please try again.', flags: MessageFlags.Ephemeral });
      }
    }
  },
};
