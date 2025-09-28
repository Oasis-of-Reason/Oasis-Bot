import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('addevent')
		.setDescription('Add an event')
		.addStringOption(option =>
			option
				.setName('name')
				.setDescription('Name of the event')
				.setRequired(true))
		.addNumberOption(option =>
			option
				.setName('start_time')
				.setDescription('The start datetime of the event (unix time)')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction: any) {
		if (!interaction.guild) {
			await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
			return;
		}

		const name = interaction.options.getString('name');
		const startTime = interaction.options.getNumber('start_time');


		if (!name) {
			await interaction.reply({ content: '❌ You must set a name.', ephemeral: true });
			return;
		}

		if (!startTime) {
			await interaction.reply({ content: '❌ You must set a start datetime.', ephemeral: true });
			return;
		}

		const startDateTime = new Date(startTime * 1000);

		if (!startDateTime) { // GuildVoice
			await interaction.reply({ content: '❌ You must give a valid start datetime in unix format.', ephemeral: true });
			return;
		}

		try {
			// Upsert the guild configuration
			await prisma.event.create({
				data: {
					name: name,
					startTime: startDateTime
				}
			});

			await interaction.reply({ 
				content: `✅ Event added!\n\n**Event Name:** ${name}\n**Start DateTime:** ${startDateTime.toLocaleString()}\n\n`, 
				ephemeral: true 
			});
		} catch (error) {
			console.error('Error adding event:', error);
			await interaction.reply({ content: '❌ An error occurred while adding the event. Please try again.', ephemeral: true });
		}
	},
}; 