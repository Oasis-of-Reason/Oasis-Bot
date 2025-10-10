import { Events } from 'discord.js';
import { deployCommands } from '../utils/deploy-commands';
import { config } from '../config';
import { startReminderWorker } from '../reminders/reminderWorker';
import { reinitialiseDraftEvents } from '../helpers/refreshDraftEvents';
import { PrismaClient } from '@prisma/client';
import { registerEventDraftCollectors } from '../helpers/eventDraft';
const prisma = new PrismaClient();

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client: any) {
		console.log(`Ready! Logged in as ${client.user.tag}`)

		if (!config.isDev) {
			for (const [guildId] of client.guilds.cache) {
				await deployCommands({ guildId: guildId });
				console.log(`Deployed commands to guild: ${guildId}`);
				console.log('starting reinitialise of Draft Events in guild.');
				//await reinitialiseDraftEvents(client);
				console.log('Reinitialised events in guild.');
				initializeEventChannelIds(guildId);
			}
		} else {
			await deployCommands({ guildId: config.isDev });
			console.log(`Deployed commands to test guild: ${config.isDev}`);
			console.log('starting reinitialise of Draft Events in Test guild.');
			//await reinitialiseDraftEvents(client);
			console.log('Reinitialised events in test guild.');
			initializeEventChannelIds(config.isDev);
		}

		await registerEventDraftCollectors(client);
		startReminderWorker(client);
		console.log('Reminder worker started.');

		// Uncomment the line below to fetch and log global commands
		//const commands = await client.application.commands.fetch();
		//console.log("Global commands:", commands.map((c: any) => c.name));

		// Uncomment the line below to deploy commands to all guilds
		// await deployCommands();
	},
};


async function initializeEventChannelIds(guildId: string) {
	await prisma.$transaction([
		prisma.guildConfig.updateMany({
			where: { id: guildId, draftChannelId: null },
			data: { draftChannelId: config.DEFAULT_EVENT_DRAFT_CHANNEL_ID },
		}),
		prisma.guildConfig.updateMany({
			where: { id: guildId, publishingVRCChannelId: null },
			data: { publishingVRCChannelId: config.DEFAULT_EVENT_PUBLISHING_VRC_CHANNEL_ID, },
		}),
		prisma.guildConfig.updateMany({
			where: { id: guildId, publishingDiscordChannelId: null },
			data: { publishingDiscordChannelId: config.DEFAULT_EVENT_PUBLISHING_DISCORD_CHANNEL_ID, },
		}),
	]);
}