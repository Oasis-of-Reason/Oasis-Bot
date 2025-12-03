import {
	Client,
	Guild
} from 'discord.js';
import {
	PrismaClient,
} from '@prisma/client';
import { oasisPremiumId } from '../helpers/generalConstants';

const prisma = new PrismaClient();

export function startHourlyWorker(client: Client) {
	const now = new Date();

	// Calculate ms until the next exact hour
	const nextHour = new Date(now);
	nextHour.setMinutes(0, 0, 0);        // set to this hour at 00:00
	if (nextHour <= now) {
		// We've already passed this hour, go to next hour
		nextHour.setHours(nextHour.getHours() + 1);
	}

	const msUntilNextHour = nextHour.getTime() - now.getTime();
	console.log(`⏳ First run scheduled in ${msUntilNextHour} ms`);

	// First run at the next whole hour
	setTimeout(() => {
		void runOnce(client).catch(console.error);

		// Then every hour afterward
		setInterval(() => {
			void runOnce(client).catch(console.error);
		}, 60 * 60 * 1000); // 1 hour interval

	}, msUntilNextHour);
}

async function runOnce(client: Client) {
	const now = new Date();
	console.log(`⏱️ Hourly worker running at ${now.toISOString()}`);
	try {
		for (const [, guild] of client.guilds.cache) {
			const result = await removeExpiredOasisPremiumRoles(guild, oasisPremiumId);
			if (result.rolesRemoved > 0) {
				console.log(
					`[${guild.name}] Premium cleanup: ${result.rolesRemoved}/${result.totalExpired} roles removed`
				);
			}
		}
	} catch { } // thou shalt not crash
}

export async function removeExpiredOasisPremiumRoles(
	guild: Guild,
	roleId: string
): Promise<{ totalExpired: number; rolesRemoved: number }> {
	const guildId = guild.id;
	const now = new Date();

	// 1) Find all users whose premium has expired
	const expiredUsers = await prisma.cookiesUser.findMany({
		where: {
			guildId,
			oasisPremiumExpiration: {
				lt: now, // expiration is in the past
			},
		},
		select: {
			userId: true,
		},
	});

	if (expiredUsers.length === 0) {
		return { totalExpired: 0, rolesRemoved: 0 };
	}

	let removedCount = 0;

	// 2) Attempt to remove the role from each member
	for (const u of expiredUsers) {
		const userId = u.userId;

		try {
			const member = await guild.members.fetch(userId).catch(() => null);
			if (!member) continue; // not in guild anymore

			// Only try if they currently have the role
			if (!member.roles.cache.has(roleId)) continue;

			// Hierarchy / permission issues will throw here if not allowed
			await member.roles.remove(roleId);
			removedCount++;
		} catch (err) {
			console.error(
				`Failed to remove premium role from user ${userId} in guild ${guildId}:`,
				err
			);
		}
	}

	return {
		totalExpired: expiredUsers.length,
		rolesRemoved: removedCount,
	};
}
