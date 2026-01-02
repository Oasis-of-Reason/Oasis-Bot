import { SlashCommandBuilder } from "discord.js";
import { getRandomInt } from "../helpers/generalHelpers";
import { TrackedInteraction } from "../utils/interactionSystem";

module.exports = {
	data: new SlashCommandBuilder()
		.setName('diceroll')
		.setDescription('generates a random number between 1 and 20'),
	async execute(ix: any) {
		await ix.reply('Dice roll! ' + (ix.interaction.member.nickname ?? ix.interaction.member.user.globalName) + ' rolled: ' + getRandomInt(1, 20) + " 🎲");
	},
};