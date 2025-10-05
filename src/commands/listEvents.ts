import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('list-events')
		.setDescription('List the latest events')
		.addNumberOption(option =>
			option
				.setName('count')
				.setDescription('How many events to display')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server!', flags: MessageFlags.Ephemeral });
			return;
		}

		const count = interaction.options.getNumber('count');

		if (!count || count <= 0) {
			await interaction.reply({ content: '❌ You must provide a valid number greater than 0.', flags: MessageFlags.Ephemeral });
			return;
		}

		try {
			const events = await prisma.event.findMany({
				orderBy: { createdAt: 'desc' },
				take: count
			});

			if (events.length === 0) {
				await interaction.reply({ content: 'ℹ️ No events found.', flags: MessageFlags.Ephemeral });
				return;
			}

			let response = `📅 Showing the latest **${events.length}** event(s):\n\n`;

			for (const event of events) {
				response += `**ID:** ${event.id}\n`;
				response += `**Name:** ${event.title}\n`;
				response += `**Start Time:** ${event.startTime.toLocaleString()}\n`;
				response += `**Created At:** ${event.createdAt.toLocaleString()}\n`;
				response += `**Updated At:** ${event.updatedAt.toLocaleString()}\n\n`;
			}

			await interaction.reply({
				content: response,
				ephemeral: true
			});
		} catch (error) {
			console.error('Error listing events:', error);
			await interaction.reply({ content: '❌ An error occurred while fetching events. Please try again.', flags: MessageFlags.Ephemeral });
		}
	},
};
