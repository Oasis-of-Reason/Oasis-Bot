import {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags
} from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setup-event-channels')
		.setDescription('Setup event channels for this server')
		.addStringOption(option =>
			option
				.setName('draft_channel')
				.setDescription('The text channel Id where events are created and editted before publishing.')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('publishing_discord_channel')
				.setDescription('The text channel Id where discord events are posted after publishing.')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('publishing_vrc_channel')
				.setDescription('The text channel Id where vrc events are posted after publishing.')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server!', flags: MessageFlags.Ephemeral });
			return;
		}

		const draftChannelId = interaction.options.getString('draft_channel');
		const publishingDiscordChannelId = interaction.options.getString('publishing_discord_channel');
		const publishingVRCChannelId = interaction.options.getString('publishing_vrc_channel');

		// Validate that the channels exist
		const draftChannel = interaction.guild.channels.cache.get(draftChannelId);
		const publishingDiscordChannel = interaction.guild.channels.cache.get(publishingDiscordChannelId);
		const publishingVRCChannel = interaction.guild.channels.cache.get(publishingVRCChannelId);

		if (!draftChannel) {
			await interaction.reply({ content: '❌ Draft channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (!publishingDiscordChannel) {
			await interaction.reply({ content: '❌ Publishing discord channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });
			return;
		}

		if (!publishingVRCChannel) {
			await interaction.reply({ content: '❌ Publishing vrc channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });
			return;
		}
		
		if (draftChannel.type !== 0) { // GuildText
			await interaction.reply({ content: '❌ The draft channel must be a text channel!', flags: MessageFlags.Ephemeral });
			return;
		}

		if (publishingDiscordChannel.type !== 0) { // GuildText
			await interaction.reply({ content: '❌ The publishing discord channel must be a text channel!', flags: MessageFlags.Ephemeral });
			return;
		}

		if (publishingVRCChannel.type !== 0) { // GuildText
			await interaction.reply({ content: '❌ The publishing vrc channel must be a text channel!', flags: MessageFlags.Ephemeral });
			return;
		}

		try {
			// Upsert the guild configuration
			await prisma.guildConfig.upsert({
				where: { id: interaction.guild.id },
				update: {
					draftChannelId: draftChannelId,
					publishingDiscordChannelId: publishingDiscordChannelId,
					publishingVRCChannelId: publishingVRCChannelId,
				},
				create: {
					id: interaction.guild.id,
					draftChannelId: draftChannelId,
					publishingDiscordChannelId: publishingDiscordChannelId,
					publishingVRCChannelId: publishingVRCChannelId,
				}
			});

			await interaction.reply({
				content: `✅ Event channel setup complete!\n\n**Draft Channel:** ${draftChannel.name}\n**Publishing Discord Channel:** ${publishingDiscordChannel.name}\n**Publishing VRC Channel:** ${publishingVRCChannel.name}`,
				flags: MessageFlags.Ephemeral
			});
		} catch (error) {
			console.error('Error setting up event channels:', error);
			await interaction.reply({ content: '❌ An error occurred while setting up the event channels. Please try again.', flags: MessageFlags.Ephemeral });
		}
	},
}; 