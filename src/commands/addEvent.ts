import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('addevent')
		.setDescription('Add an event')
		.addStringOption(option =>
			option
				.setName('title')
				.setDescription('Title of the event')
				.setRequired(true))
		.addNumberOption(option =>
			option
				.setName('start_time')
				.setDescription('Start time (unix timestamp, seconds)')
				.setRequired(true))
		.addStringOption(o =>
			o.setName('type')
			 .setDescription('Event type')
			 .setRequired(false))
		.addStringOption(o =>
			o.setName('subtype')
			 .setDescription('Event subtype')
			 .setRequired(false))
		.addStringOption(o =>
			o.setName('game')
			 .setDescription('Game name (e.g., VRChat)')
			 .setRequired(false))
		.addStringOption(o =>
			o.setName('platforms')
			 .setDescription('Platforms (e.g., PC, Android)')
			 .setRequired(false))
		.addStringOption(o =>
			o.setName('requirements')
			 .setDescription('Requirements (e.g., Avatar performance rating)')
			 .setRequired(false))
		.addStringOption(o =>
			o.setName('description')
			 .setDescription('Short description')
			 .setRequired(false))
		.addStringOption(o =>
			o.setName('image_url')
			 .setDescription('Image URL')
			 .setRequired(false))
		.addStringOption(o =>
			o.setName('scope')
			 .setDescription('Invitee Scope')
			 .setRequired(false))
		.addIntegerOption(o =>
			o.setName('capacity')
			 .setDescription('Max attendees (0 = no limit)')
			 .setRequired(false))
		.addIntegerOption(o =>
			o.setName('cohost_capacity')
			 .setDescription('Max co-hosts')
			 .setRequired(false))
		.addIntegerOption(o =>
			o.setName('length_minutes')
			 .setDescription('Event length in minutes')
			 .setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		if (!interaction.guild || !interaction.channel) {
			await interaction.reply({ content: 'This command can only be used in a server text channel!', ephemeral: true });
			return;
		}

		const title = interaction.options.getString('title');
		const startTime = interaction.options.getNumber('start_time');

		// Optional fields
		const type = interaction.options.getString('type') ?? '';
		const subtype = interaction.options.getString('subtype') ?? '';
		const game = interaction.options.getString('game') ?? '';
		const platforms = interaction.options.getString('platforms') ?? '';
		const requirements = interaction.options.getString('requirements') ?? '';
		const description = interaction.options.getString('description') ?? '';
		const imageUrl = interaction.options.getString('image_url') ?? '';
		const scope = interaction.options.getString('scope') ?? '';
		const capacity = interaction.options.getInteger('capacity') ?? 0;
		const cohostCapacity = interaction.options.getInteger('cohost_capacity') ?? 0;
		const lengthMinutes = interaction.options.getInteger('length_minutes') ?? null;

		// Basic validation
		if (!title?.trim()) {
			await interaction.reply({ content: '❌ You must provide a title.', ephemeral: true });
			return;
		}
		if (!startTime) {
			await interaction.reply({ content: '❌ You must provide a start time (unix seconds).', ephemeral: true });
			return;
		}

		const startDateTime = new Date(startTime * 1000);
		if (isNaN(startDateTime.getTime())) {
			await interaction.reply({ content: '❌ Invalid start_time. Please provide a valid unix timestamp (seconds).', ephemeral: true });
			return;
		}
		if (capacity < 0 || cohostCapacity < 0) {
			await interaction.reply({ content: '❌ Capacities must be ≥ 0.', ephemeral: true });
			return;
		}
		if (lengthMinutes !== null && lengthMinutes <= 0) {
			await interaction.reply({ content: '❌ length_minutes must be a positive integer if provided.', ephemeral: true });
			return;
		}

		try {
			// Create the event per your schema
			const event = await prisma.event.create({
				data: {
					guildId: interaction.guild.id,
					channelId: interaction.channel.id,
					messageId: '',      // set after you send a message (update later)
					threadId: '',       // set after you create a thread (update later)

					title: title.trim(),
					type,
					subtype,
					game,
					platforms,
					requirements,
					description,
					imageUrl,

					hostId: interaction.user.id,
					scope,
					published:false, // published
					capacity,
					cohostCapacity,

					startTime: startDateTime,
					lengthMinutes,      // nullable; omitted if null in Prisma client

					// You can seed relations here if desired:
					// signups: { create: [{ userId: interaction.user.id }] },
					// cohosts: { create: [{ hostId: 'someUserId' }] },
					// interested: { create: [{ userId: 'someUserId' }] },
				},
			});

			// Friendly confirmation (ephemeral)
			const unix = Math.floor(startDateTime.getTime() / 1000);
			await interaction.reply({
				content:
`✅ Event created!

**Title:** ${event.title}
**When:** <t:${unix}:F> • <t:${unix}:R>
**Type/Subtype:** ${event.type || '—'}${event.subtype ? ` / ${event.subtype}` : ''}
**Game:** ${event.game || '—'}
**Platforms:** ${event.platforms || '—'}
**Capacity:** ${event.capacity == 0 ? "Unlimited " : event.capacity} (cohosts: ${event.cohostCapacity})
**Host:** <@${event.hostId}>`,
				ephemeral: true,
			});
		} catch (error) {
			console.error('Error adding event:', error);
			await interaction.reply({ content: '❌ An error occurred while adding the event. Please try again.', ephemeral: true });
		}
	},
};