import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('deleteevent')
		.setDescription('Delete an event')
		.addStringOption(option =>
			option
				.setName('id')
				.setDescription('id of the event to delete')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
			return;
		}

		const id = interaction.options.getString('id');

		if (!id) {
			await interaction.reply({ content: '❌ You must specify an event id.', ephemeral: true });
			return;
		}

		try {
			const deletedEvent = await prisma.event.delete({
				where: { id }
			});

			await interaction.reply({
				content: `✅ Event deleted!\n\n**Event Name:** ${deletedEvent.name}\n**Start DateTime:** ${deletedEvent.startTime.toLocaleString()}`,
				ephemeral: true
			});
		} catch (error: any) {
			if (error.code === 'P2025') {
				// Prisma error when record not found
				await interaction.reply({ content: `❌ No event found with the name **${name}**.`, ephemeral: true });
			} else {
				console.error('Error deleting event:', error);
				await interaction.reply({ content: '❌ An error occurred while deleting the event. Please try again.', ephemeral: true });
			}
		}
	},
};
