import { SlashCommandBuilder } from "discord.js";
import { TrackedInteraction } from "../utils/interactionSystem";

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong!'),
	async execute(ix: TrackedInteraction) {
		await ix.reply('Pong! 🏓');
	},
};