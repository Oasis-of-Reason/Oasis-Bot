import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('updateevent')
		.setDescription('Update an event by ID (any fields you provide will be updated)')
		.addStringOption(option =>
			option
				.setName('id')
				.setDescription('The ID of the event to update')
				.setRequired(true))
		.addStringOption(option =>
			option
				.setName('name')
				.setDescription('New name of the event (leave blank to keep current)')
				.setRequired(false))
		.addNumberOption(option =>
			option
				.setName('start_time')
				.setDescription('New start datetime (unix time). Leave blank to keep current.')
				.setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
			return;
		}

		const id = interaction.options.getString('id');
		const name = interaction.options.getString('name');               // may be null/undefined
		const startTime = interaction.options.getNumber('start_time');    // may be null/undefined

		if (!id) {
			await interaction.reply({ content: '❌ You must specify the event ID.', ephemeral: true });
			return;
		}

		// Build the data object only with provided fields
		const data: Record<string, any> = {};

		if (typeof name === 'string') {
			const trimmed = name.trim();
			if (trimmed.length === 0) {
				await interaction.reply({ content: '❌ Name cannot be empty. Omit the field to keep the current name.', ephemeral: true });
				return;
			}
			data.name = trimmed;
		}

		if (typeof startTime === 'number') {
			const startDateTime = new Date(startTime * 1000);
			if (isNaN(startDateTime.getTime())) {
				await interaction.reply({ content: '❌ Invalid start_time. Please provide a valid unix timestamp.', ephemeral: true });
				return;
			}
			data.startTime = startDateTime;
		}

		if (Object.keys(data).length === 0) {
			await interaction.reply({
				content: '❌ Provide at least one field to update (e.g., name or start_time). Leave fields blank to keep them unchanged.',
				ephemeral: true
			});
			return;
		}

		try {
			const updatedEvent = await prisma.event.update({
				where: { id },
				data
			});

			await interaction.reply({
				content:
`✅ Event updated!
**ID:** ${updatedEvent.id}
**Name:** ${updatedEvent.title}
**Start DateTime:** ${updatedEvent.startTime.toLocaleString()}
**Updated At:** ${updatedEvent.updatedAt.toLocaleString()}`,
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
