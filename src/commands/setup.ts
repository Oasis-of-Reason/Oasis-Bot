import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setup')
		.setDescription('Setup voice channel creator configuration for this server')
		.addStringOption(option =>
			option
				.setName('voice_creator_room')
				.setDescription('The voice channel ID where users join to create temporary channels')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('voice_creator_category')
				.setDescription('The category ID where temporary voice channels will be created')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server!', flags: MessageFlags.Ephemeral });
			return;
		}

		const voiceCreatorRoom = interaction.options.getString('voice_creator_room');
		const voiceCreatorCategory = interaction.options.getString('voice_creator_category');

		// Validate that the channels exist
		const roomChannel = interaction.guild.channels.cache.get(voiceCreatorRoom);
		const categoryChannel = interaction.guild.channels.cache.get(voiceCreatorCategory);

		if (!roomChannel) {
			await interaction.reply({ content: '❌ Voice creator room channel not found! Please check the channel ID.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (!categoryChannel) {
			await interaction.reply({ content: '❌ Voice creator category not found! Please check the category ID.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (roomChannel.type !== 2) { // GuildVoice
			await interaction.reply({ content: '❌ The voice creator room must be a voice channel!', flags: MessageFlags.Ephemeral });
			return;
		}

		if (categoryChannel.type !== 4) { // GuildCategory
			await interaction.reply({ content: '❌ The voice creator category must be a category!', flags: MessageFlags.Ephemeral });
			return;
		}

		try {
			// Upsert the guild configuration
			await prisma.guildConfig.upsert({
				where: { id: interaction.guild.id },
				update: {
					voiceCreatorRoomId: voiceCreatorRoom,
					voiceCreatorCategory: voiceCreatorCategory
				},
				create: {
					id: interaction.guild.id,
					voiceCreatorRoomId: voiceCreatorRoom,
					voiceCreatorCategory: voiceCreatorCategory
				}
			});

			await interaction.reply({ 
				content: `✅ Voice channel creator setup complete!\n\n**Voice Creator Room:** ${roomChannel.name}\n**Category:** ${categoryChannel.name}\n\nUsers can now join the voice creator room to automatically create temporary voice channels!`, 
				ephemeral: true 
			});
		} catch (error) {
			console.error('Error setting up voice channel creator:', error);
			await interaction.reply({ content: '❌ An error occurred while setting up the voice channel creator. Please try again.', flags: MessageFlags.Ephemeral });
		}
	},
}; 