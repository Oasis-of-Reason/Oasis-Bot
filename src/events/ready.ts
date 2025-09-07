import { Events } from 'discord.js';
import { deployCommands } from '../utils/deploy-commands';
import { config } from '../config';

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client: any) {
		console.log(`Ready! Logged in as ${client.user.tag}`)

		if (!config.isDev) {
			for (const [guildId] of client.guilds.cache) {
				await deployCommands({ guildId: guildId });
				console.log(`Deployed commands to guild: ${guildId}`);
			}
		} else {
			await deployCommands({ guildId: config.isDev });
			console.log(`Deployed commands to test guild: ${config.isDev}`);
		}

		// Uncomment the line below to fetch and log global commands
		//const commands = await client.application.commands.fetch();
        //console.log("Global commands:", commands.map((c: any) => c.name));

		// Uncomment the line below to deploy commands to all guilds
		// await deployCommands();
	},
};