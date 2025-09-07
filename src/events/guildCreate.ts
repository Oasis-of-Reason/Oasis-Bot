import { Events } from 'discord.js';
import { deployCommands } from '../utils/deploy-commands';
import { config } from '../config';

module.exports = {
	name: Events.GuildCreate,
	async execute(guild: any) {
		if (!config.isDev) {
			await deployCommands({ guildId: guild.id });
			console.log(`Deployed commands to new guild: ${guild.id}`);
		} else {
			console.log(`Tried to deploy commands to a new guild (${guild.id}), but this is dev mode. Skipping.`);
		}
	},
};