import {
	Client,
	EmbedBuilder,
	Guild,
	TextChannel,
} from 'discord.js';
import {
	PrismaClient,
} from '@prisma/client';
import { allowedPingRolesCookies, cookieUpdatesMentionString } from './generalConstants';

const TOTAL_WEIGHT = 1;
const SHION = "289822517944778752"; // Shion's Id

const prisma = new PrismaClient();

export async function runCookieHourlyEvent(client: Client, guild: Guild) {

	const now = new Date();
	const hours = now.getHours();
	let rand = Math.random();
	if (rand < 0.8 || (hours >= 0 && hours < 8)) {
		// We don't wanna do random events at night, and only 20% chance per hour should average ~3 a day.
		return;
	}
	const guildId = guild.id;
	rand = Math.random() * TOTAL_WEIGHT;
	try {
		if (rand < 1) {
			await giveCookiesToVC(guild);
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

async function giveCookiesToVC(guild: Guild) {
	const users = await getUsersInAnyVoice(guild);
	if (!users || users.length === 0) {
		return;
	}
	await giveCookiesToUsers(guild.id, await getUsersInAnyVoice(guild));
	const cookieChannelId = await getCookieChannelId(guild.id);
	if (!cookieChannelId) {
		return;
	}
	const cookieChannel = guild.channels.cache.get(cookieChannelId);
	if (!cookieChannel) {
		return;
	}
	const newMsg = await (cookieChannel as TextChannel).send(buildVoiceCookieRewardEmbed());
}

export async function getCookieChannelId(guildId: string): Promise<string | null> {
	const config = await prisma.guildConfig.findUnique({
		where: { id: guildId },
		select: { cookieChannelId: true },
	});

	return config?.cookieChannelId ?? null;
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

export function buildVoiceCookieRewardEmbed(): {
	content: string;
	embeds: EmbedBuilder[];
	allowedMentions: { roles: string[] };
} {
	const embed = new EmbedBuilder()
		.setColor(0xffb703) // warm cookie color 🍪
		.setTitle("🦈 Cookie Time!")
		.setDescription(
			"Shion splashes happily and hands out **cookies to everyone in voice chat**!\n\n" +
			"🍪 **+1 cookie** for each brave swimmer!"
		)
		.setFooter({ text: "Be nice to Shion. He remembers everything." });

	return {
		content: cookieUpdatesMentionString,
		embeds: [embed],
		allowedMentions: {
			roles: allowedPingRolesCookies,
		},
	};
}