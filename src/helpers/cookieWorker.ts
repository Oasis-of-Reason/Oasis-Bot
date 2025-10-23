import {
	Client,
	Guild,
} from 'discord.js';
import {
	PrismaClient,
} from '@prisma/client';

const NUMBER_OF_OPTIONS = 2;
const SHION = "289822517944778752"; // Shion's Id

const prisma = new PrismaClient();

export function startCookieWorker(client: Client, guild: Guild) {
	void runOnce(client, guild).catch(console.error);
	setInterval(() => void runOnce(client, guild).catch(console.error), 60000 * 60);
}

async function runOnce(client: Client, guild: Guild) {

	const now = new Date();
	const hours = now.getHours();
	let rand = Math.random();
	if (rand < 0.9 || (hours >= 0 && hours < 8)) {
		// We don't wanna do random events at night, and only 10% chance per hour should average ~1.6 a day.
		return;
	}
	const guildId = guild.id;
	rand = Math.random() * NUMBER_OF_OPTIONS;
	try {
		if (rand < 1) {
			await giveCookiesToEveryoneExcept(guildId, SHION);
		} else if (rand < 2) {
			await giveCookiesToUsers(guildId, await getUsersInAnyVoice(guild));
		}
	}
	catch (e) { console.error(e); }
}

async function giveCookiesToEveryoneExcept(
	guildId: string,
	excludedUserId: string,
	increment = 1,
	touchLastAttempt = false
): Promise<number> {
	const data: any = {
		cookies: { increment: increment },
	};
	if (touchLastAttempt) data.lastCookieAttempt = new Date();

	const result = await prisma.cookiesUser.updateMany({
		where: {
			guildId,
			NOT: { userId: excludedUserId },
		},
		data,
	});

	return result.count; // number of users who received cookies
}

async function giveCookiesToUsers(
	guildId: string,
	userIds: string[],
	increment = 1,
	touchLastAttempt = false
): Promise<number> {
	if (!userIds.length) return 0; // nothing to do

	const data: any = {
		cookies: { increment: increment },
	};
	if (touchLastAttempt) data.lastCookieAttempt = new Date();

	const result = await prisma.cookiesUser.updateMany({
		where: {
			guildId,
			userId: { in: userIds },
		},
		data,
	});

	return result.count;
}

async function getUsersInAnyVoice(guild: Guild): Promise<string[]> {
	// Each VoiceState's ID is the userId. channelId is null if they're not in a channel.
	const ids = new Set<string>();
	for (const [, vs] of guild.voiceStates.cache) {
		if (vs.channelId) ids.add(vs.id); // vs.id === userId
	}
	return [...ids];
}