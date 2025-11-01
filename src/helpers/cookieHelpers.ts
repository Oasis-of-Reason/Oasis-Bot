import { prisma } from "../utils/prisma";

export async function giveCookies(guildId: string, userId: string, amount: number = 1) {
	await prisma.cookiesUser.upsert({
		where: { guildId_userId: { guildId, userId: userId } },
		update: { cookies: { increment: amount } },
		create: { guildId, userId: userId, cookies: amount, lastCookieAttempt: new Date(0) },
	});
}