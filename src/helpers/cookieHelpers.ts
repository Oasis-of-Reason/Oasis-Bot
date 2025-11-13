import { prisma } from "../utils/prisma";

export async function giveCookies(guildId: string, userId: string, amount: number = 1) {
	await prisma.cookiesUser.upsert({
		where: { guildId_userId: { guildId, userId: userId } },
		update: { cookies: { increment: amount } },
		create: { guildId, userId: userId, cookies: amount, lastCookieAttempt: new Date(0) },
	});
}

export async function incrementCookieRage(guildId: string): Promise<number> {
  const updated = await prisma.cookies.upsert({
    where: { id: guildId },
    update: {
      CookieRageCounter: { increment: 1 },
    },
    create: {
      id: guildId,
      CookieRageCounter: 1,
    },
    select: {
      CookieRageCounter: true,
    },
  });

  return updated.CookieRageCounter;
}