import { prisma } from "../utils/prisma";
import { emojiMapPlatforms, emojiMapRequirements, pingMap } from "./generalConstants";

export async function getEventById(eventId: number): Promise<(any & { _count: { signups: number; interested: number } }) | null> {
	try {
		const event = await prisma.event.findUnique({
			where: { id: eventId },
			include: {
				_count: {
					select: { signups: true, interested: true },
				},
				cohosts: true,   // optional: include cohosts relation
				signups: true,   // optional: include full signups list
				interested: true // optional: include interested users list
			},
		});

		return event;
	} catch (error) {
		console.error(`Error fetching event ${eventId}:`, error);
		return null;
	}
}

export function formatRemaining(ms: number) {
	const totalSec = Math.ceil(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

export function getEventCapacity(event: any): number {
	return (event.capacityBase > 0 ? Math.min(event.capacityBase * (event.cohosts.length + 1), event.capacityCap) : event.capacityCap) as number;
}

export function validateNumber(numberString: string): number {

	let myNumber = numberString ? parseInt(numberString, 10) : 0;
	if (Number.isNaN(myNumber) || myNumber < 0) myNumber = 0;

	return Math.min(myNumber, 43200);
}

/**
 * Ensures a user has default reminder settings.
 * If the user doesn't exist, it creates one with default values.
 * @param userId Discord user ID
 * @returns The user's settings record
 */
export async function ensureUserReminderDefaults(userId: string) {
	const existing = await prisma.user.findUnique({
		where: { id: userId },
	});

	if (existing) {
		return;
	}

	// Create new defaults if none exist
	const created = await prisma.user.create({
		data: {
			id: userId,
			reminderNotifications: true,
			eventStartingNotifications: true,
			reminderMinutesBefore: 30,
		},
	});
}

export function getRandomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getPingString(eventType: string, eventSubtype: string): string {
	return pingMap[eventType][eventSubtype].value;
}

export function getRequirementsString(value: string) {
	const key = value.toLowerCase();
	return `${emojiMapRequirements[key]?.emoji || ""} ${emojiMapRequirements[key].label}`
}

export function getPlatformsString(value: string) {
	const platforms = JSON.parse(value) as string[];
	return getPlatformsArray(platforms);
}

export function getPlatformsArray(platforms: string[]) {
	let platformString = "";
	platforms.forEach(element => {
		const key = element.toLowerCase();
		platformString = platformString + `${emojiMapPlatforms[key]?.emoji || ""} `
	});
	return platformString;
}

export function splitArray<T>(arr: T[], maxFirst: number): [T[], T[]] {
	const first = arr.slice(0, maxFirst);
	const second = arr.slice(maxFirst);
	return [first, second];
}

export const toUnix = (d: Date) => Math.floor(d.getTime() / 1000);


export async function setLastTitleChangeTime(eventId: number): Promise<void> {
	await prisma.event.update({
		where: { id: eventId },
		data: { lastTitleChangeTime: new Date() },
	});
}

export async function hasTitleChangeCooldownPassed(
	eventId: number,
	minutes: number = 5
): Promise<boolean> {
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { lastTitleChangeTime: true },
	});

	if (!event?.lastTitleChangeTime) {
		// No timestamp stored → treat as "cooldown passed"
		return true;
	}

	const elapsedMs = Date.now() - event.lastTitleChangeTime.getTime();
	const requiredMs = minutes * 60 * 1000;

	return elapsedMs >= requiredMs;
}

export async function setLastVrcUpdateTime(eventId: number): Promise<void> {
	await prisma.event.update({
		where: { id: eventId },
		data: { lastVrcUpdateTime: new Date() },
	});
}

export async function hasVrcUpdateCooldownPassed(
	eventId: number,
	minutes: number = 5
): Promise<boolean> {
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { lastVrcUpdateTime: true },
	});

	if (!event?.lastVrcUpdateTime) {
		// No timestamp stored → treat as "cooldown passed"
		return true;
	}
	
	const elapsedMs = Date.now() - event.lastVrcUpdateTime.getTime();
	const requiredMs = minutes * 60 * 1000;

	return elapsedMs >= requiredMs;
}