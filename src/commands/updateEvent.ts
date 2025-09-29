import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('updateevent')
		.setDescription('Update an event by ID (provide any fields to change)')
		.addIntegerOption(o =>
			o.setName('id')
			 .setDescription('Event ID to update')
			 .setRequired(true))
		.addStringOption(o => o.setName('title').setDescription('New title').setRequired(false))
		.addNumberOption(o => o.setName('start_time').setDescription('New start time (unix seconds)').setRequired(false))
		.addIntegerOption(o => o.setName('length_minutes').setDescription('New length in minutes').setRequired(false))
		.addBooleanOption(o => o.setName('clear_length').setDescription('Set length_minutes to NULL').setRequired(false))

		.addStringOption(o => o.setName('type').setDescription('Event type').setRequired(false))
		.addStringOption(o => o.setName('subtype').setDescription('Event subtype').setRequired(false))
		.addStringOption(o => o.setName('game').setDescription('Game').setRequired(false))
		.addStringOption(o => o.setName('platforms').setDescription('Platforms').setRequired(false))
		.addStringOption(o => o.setName('requirements').setDescription('Requirements').setRequired(false))
		.addStringOption(o => o.setName('description').setDescription('Description').setRequired(false))
		.addStringOption(o => o.setName('image_url').setDescription('Image URL').setRequired(false))

		.addIntegerOption(o => o.setName('capacity').setDescription('Max attendees').setRequired(false))
		.addIntegerOption(o => o.setName('cohost_capacity').setDescription('Max co-hosts').setRequired(false))

		.addStringOption(o => o.setName('host_id').setDescription('New host user ID').setRequired(false))
		.addStringOption(o => o.setName('channel_id').setDescription('Channel ID for this event').setRequired(false))
		.addStringOption(o => o.setName('message_id').setDescription('Announcement message ID').setRequired(false))
		.addStringOption(o => o.setName('thread_id').setDescription('Thread ID').setRequired(false))

		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
			return;
		}

		const id = interaction.options.getInteger('id', true);

		// Optional fields
		const title = interaction.options.getString('title');
		const startTime = interaction.options.getNumber('start_time');
		const lengthMinutes = interaction.options.getInteger('length_minutes');
		const clearLength = interaction.options.getBoolean('clear_length') ?? false;

		const type = interaction.options.getString('type');
		const subtype = interaction.options.getString('subtype');
		const game = interaction.options.getString('game');
		const platforms = interaction.options.getString('platforms');
		const requirements = interaction.options.getString('requirements');
		const description = interaction.options.getString('description');
		const imageUrl = interaction.options.getString('image_url');

		const capacity = interaction.options.getInteger('capacity');
		const cohostCapacity = interaction.options.getInteger('cohost_capacity');

		const hostId = interaction.options.getString('host_id');
		const channelId = interaction.options.getString('channel_id');
		const messageId = interaction.options.getString('message_id');
		const threadId = interaction.options.getString('thread_id');

		// Build the update payload with only provided values
		const data: Record<string, any> = {};

		// Strings (ignore empty strings)
		const setIfString = (key: string, val: string | null) => {
			if (typeof val === 'string') {
				const t = val.trim();
				if (t.length > 0) data[key] = t;
			}
		};

		setIfString('title', title);
		setIfString('type', type);
		setIfString('subtype', subtype);
		setIfString('game', game);
		setIfString('platforms', platforms);
		setIfString('requirements', requirements);
		setIfString('description', description);
		setIfString('imageUrl', imageUrl);
		setIfString('hostId', hostId);
		setIfString('channelId', channelId);
		setIfString('messageId', messageId);
		setIfString('threadId', threadId);

		// Integers
		if (capacity !== null && capacity !== undefined) {
			if (capacity < 0) {
				await interaction.reply({ content: '❌ capacity must be ≥ 0.', ephemeral: true });
				return;
			}
			data.capacity = capacity;
		}
		if (cohostCapacity !== null && cohostCapacity !== undefined) {
			if (cohostCapacity < 0) {
				await interaction.reply({ content: '❌ cohost_capacity must be ≥ 0.', ephemeral: true });
				return;
			}
			data.cohostCapacity = cohostCapacity;
		}
		if (lengthMinutes !== null && lengthMinutes !== undefined) {
			if (lengthMinutes <= 0) {
				await interaction.reply({ content: '❌ length_minutes must be a positive integer.', ephemeral: true });
				return;
			}
			data.lengthMinutes = lengthMinutes;
		}
		if (clearLength) {
			data.lengthMinutes = null; // explicitly clear
		}

		// start_time
		if (typeof startTime === 'number') {
			const dt = new Date(startTime * 1000);
			if (isNaN(dt.getTime())) {
				await interaction.reply({ content: '❌ Invalid start_time. Provide a valid unix timestamp (seconds).', ephemeral: true });
				return;
			}
			data.startTime = dt;
		}

		if (Object.keys(data).length === 0) {
			await interaction.reply({
				content: '❌ Provide at least one field to update (e.g., title, start_time, capacity, etc.).',
				ephemeral: true
			});
			return;
		}

		try {
			const updated = await prisma.event.update({
				where: { id },
				data
			});

			const unix = Math.floor(new Date(updated.startTime).getTime() / 1000);
			await interaction.reply({
				content:
`✅ Event updated!

**ID:** ${updated.id}
**Title:** ${updated.title}
**When:** <t:${unix}:F> • <t:${unix}:R>
**Type/Subtype:** ${updated.type || '—'}${updated.subtype ? ` / ${updated.subtype}` : ''}
**Game:** ${updated.game || '—'}
**Platforms:** ${updated.platforms || '—'}
**Capacity:** ${updated.capacity == 0 ? "Unlimited " : updated.capacity} (cohosts: ${updated.cohostCapacity})
**Host:** <@${updated.hostId}>
${updated.lengthMinutes ? `**Length:** ${updated.lengthMinutes} min` : ''}`,
				ephemeral: true
			});
		} catch (error: any) {
			if (error.code === 'P2025') {
				await interaction.reply({ content: `❌ No event found with ID **${id}**.`, ephemeral: true });
			} else {
				console.error('Error updating event:', error);
				await interaction.reply({ content: '❌ An error occurred while updating the event. Please try again.', ephemeral: true });
			}
		}
	},
};
