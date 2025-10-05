import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  CacheType, 
  MessageFlags,
  GuildMember,
} from 'discord.js';
import { 
  userHasAllowedRole,
  getStandardRolesHost
} from "../helpers/securityHelpers";
import { PrismaClient } from '@prisma/client';
import { buildCalenderEmbed } from '../helpers/buildCalenderEmbed';
const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('calender')
    .setDescription('Show all upcoming events grouped by day (host + time + linked title + relative time + capacity)'),

  async execute(interaction: ChatInputCommandInteraction<CacheType>) {

    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server!', flags: MessageFlags.Ephemeral });
      return;
    }

    let canSeeDrafts = userHasAllowedRole(interaction.member as GuildMember, getStandardRolesHost());

    const now = new Date();
    const guildId = interaction.guildId;
    let events;
    if(canSeeDrafts) {
      events = await prisma.event.findMany({
        where: {
          guildId: guildId,
          startTime: { gte: now }
        },
        orderBy: { startTime: 'asc' },
        include: {
          _count: { select: { signups: true } },
        },
      });
    } else {
      events = await prisma.event.findMany({
        where: {
          guildId: guildId,
          startTime: { gte: now },
          published: true
        },
        orderBy: { startTime: 'asc' },
        include: {
          _count: { select: { signups: true } },
        },
      });
    }
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
