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
				.setDescription('The text channel Id where events are created and edited before publishing.')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('publishing_discord_channel')
				.setDescription('The text channel Id where Discord events are posted after publishing.')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('publishing_vrc_channel')
				.setDescription('The text channel Id where VRC events are posted after publishing.')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('publishing_media_channel')
				.setDescription('The text channel Id where Media events are posted after publishing.')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('upcoming_events_channel')
				.setDescription('The text channel Id where upcoming events are announced.')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('cookie_channel')
				.setDescription('The text channel Id where cookie-related messages are posted.')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server!', flags: MessageFlags.Ephemeral });
			return;
		}

		const guild = interaction.guild;
		const draftChannelId = interaction.options.getString('draft_channel');
		const publishingDiscordChannelId = interaction.options.getString('publishing_discord_channel');
		const publishingVRCChannelId = interaction.options.getString('publishing_vrc_channel');
		const publishingMediaChannelId = interaction.options.getString('publishing_media_channel');
		const upcomingEventsChannelId = interaction.options.getString('upcoming_events_channel');
		const cookieChannelId = interaction.options.getString('cookie_channel');

		// Fetch channels
		const draftChannel = guild.channels.cache.get(draftChannelId);
		const publishingDiscordChannel = guild.channels.cache.get(publishingDiscordChannelId);
		const publishingVRCChannel = guild.channels.cache.get(publishingVRCChannelId);
		const publishingMediaChannel = guild.channels.cache.get(publishingMediaChannelId);
		const upcomingEventsChannel = guild.channels.cache.get(upcomingEventsChannelId);
		const cookieChannel = guild.channels.cache.get(cookieChannelId);

		// Validate all channels exist
		if (!draftChannel)
			return await interaction.reply({ content: '❌ Draft channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });
		if (!publishingDiscordChannel)
			return await interaction.reply({ content: '❌ Publishing Discord channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });
		if (!publishingVRCChannel)
			return await interaction.reply({ content: '❌ Publishing VRC channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });
		if (!publishingMediaChannel)
			return await interaction.reply({ content: '❌ Publishing Media channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });
		if (!upcomingEventsChannel)
			return await interaction.reply({ content: '❌ Upcoming events channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });
		if (!cookieChannel)
			return await interaction.reply({ content: '❌ Cookie channel not found! Please check the channel Id.', flags: MessageFlags.Ephemeral });

		// Ensure all are text channels (type 0 = GuildText)
		const textType = 0;
		if (draftChannel.type !== textType)
			return await interaction.reply({ content: '❌ The draft channel must be a text channel!', flags: MessageFlags.Ephemeral });
		if (publishingDiscordChannel.type !== textType)
			return await interaction.reply({ content: '❌ The publishing Discord channel must be a text channel!', flags: MessageFlags.Ephemeral });
		if (publishingVRCChannel.type !== textType)
			return await interaction.reply({ content: '❌ The publishing VRC channel must be a text channel!', flags: MessageFlags.Ephemeral });
		if (publishingMediaChannel.type !== textType)
			return await interaction.reply({ content: '❌ The publishing Media channel must be a text channel!', flags: MessageFlags.Ephemeral });
		if (upcomingEventsChannel.type !== textType)
			return await interaction.reply({ content: '❌ The upcoming events channel must be a text channel!', flags: MessageFlags.Ephemeral });
		if (cookieChannel.type !== textType)
			return await interaction.reply({ content: '❌ The cookie channel must be a text channel!', flags: MessageFlags.Ephemeral });

		try {
			// Upsert the guild configuration in the DB
			await prisma.guildConfig.upsert({
				where: { id: guild.id },
				update: {
					draftChannelId,
					publishingDiscordChannelId,
					publishingVRCChannelId,
					publishingMediaChannelId,
					upcomingEventsChannelId,
					cookieChannelId
				},
				create: {
					id: guild.id,
					draftChannelId,
					publishingDiscordChannelId,
					publishingVRCChannelId,
					publishingMediaChannelId,
					upcomingEventsChannelId,
					cookieChannelId
				}
			});

			await interaction.reply({
				content:
					`✅ **Event channel setup complete!**\n\n` +
					`**Draft Channel:** ${draftChannel.name}\n` +
					`**Publishing Discord Channel:** ${publishingDiscordChannel.name}\n` +
					`**Publishing VRC Channel:** ${publishingVRCChannel.name}\n` +
					`**Publishing Media Channel:** ${publishingMediaChannel.name}\n` +
					`**Upcoming Events Channel:** ${upcomingEventsChannel.name}\n` +
					`**Cookie Channel:** ${cookieChannel.name}`,
				flags: MessageFlags.Ephemeral
			});
		} catch (error) {
			console.error('Error setting up event channels:', error);
			await interaction.reply({
				content: '❌ An error occurred while setting up the event channels. Please try again.',
				flags: MessageFlags.Ephemeral
			});
		}
	},
};
