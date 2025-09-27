import { SlashCommandBuilder } from "discord.js";

module.exports = {
	data: new SlashCommandBuilder()
		.setName('diceroll')
		.setDescription('generates a random number between 1 and 20'),
	async execute(interaction: any) {
		await interaction.reply('Dice roll! ' + (interaction.member.nickname ?? interaction.member.user.globalName) + ' rolled: ' + getRandomInt(1, 20) + " 🎲");
	},
};

function getRandomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}