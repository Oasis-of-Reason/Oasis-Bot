import {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
	ChatInputCommandInteraction
} from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { TrackedInteraction } from '../utils/interactionSystem';

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setup-voice-channel-creator')
		.setDescription('Setup voice channel creator configuration for this server')
		.addStringOption(option =>
			option
				.setName('voice_creator_room')
				.setDescription('The voice channel Id where users join to create temporary channels')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('voice_creator_category')
				.setDescription('The category Id where temporary voice channels will be created')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(ix: TrackedInteraction) {
		if (!ix.interaction.guild) {
			await ix.reply({ content: 'This command can only be used in a server!', flags: MessageFlags.Ephemeral });
			return;
		}
		
		const interaction = ix.interaction as ChatInputCommandInteraction;
		const voiceCreatorRoom = interaction.options.getString('voice_creator_room', true);
		const voiceCreatorCategory = interaction.options.getString('voice_creator_category', true);

		// Validate that the channels exist
		const roomChannel = ix.interaction.guild.channels.cache.get(voiceCreatorRoom);
		const categoryChannel = ix.interaction.guild.channels.cache.get(voiceCreatorCategory);

		if (!roomChannel) {
			await ix.reply({ content: '❌ Voice creator room channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (!categoryChannel) {
			await ix.reply({ content: '❌ Voice creator category not found! Please check the category Id.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (roomChannel.type !== 2) { // GuildVoice
			await ix.reply({ content: '❌ The voice creator room must be a voice channel!', flags: MessageFlags.Ephemeral });
			return;
		}

		if (categoryChannel.type !== 4) { // GuildCategory
			await ix.reply({ content: '❌ The voice creator category must be a category!', flags: MessageFlags.Ephemeral });
			return;
		}

		try {
			// Upsert the guild configuration
			await prisma.guildConfig.upsert({
				where: { id: ix.interaction.guild.id },
				update: {
					voiceCreatorRoomId: voiceCreatorRoom,
					voiceCreatorCategory: voiceCreatorCategory
				},
				create: {
					id: ix.interaction.guild.id,
					voiceCreatorRoomId: voiceCreatorRoom,
					voiceCreatorCategory: voiceCreatorCategory
				}
			});

			await ix.reply({
				content: `✅ Voice channel creator setup complete!\n\n**Voice Creator Room:** ${roomChannel.name}\n**Category:** ${categoryChannel.name}\n\nUsers can now join the voice creator room to automatically create temporary voice channels!`,
				flags: MessageFlags.Ephemeral
			});
		} catch (error) {
			console.error('Error setting up voice channel creator:', error);
			await ix.reply({ content: '❌ An error occurred while setting up the voice channel creator. Please try again.', flags: MessageFlags.Ephemeral });
		}
	},
}; 