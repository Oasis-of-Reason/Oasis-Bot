import { prisma } from "../utils/prisma";

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

export function getEventCapacity(event: any): number {
	return (event.capacityBase > 0 ? Math.min(event.capacityBase * (event.cohosts.length + 1), event.capacityCap) : event.capacityCap) as number;
}

export function validateNumber(numberString: string): number {

	let myNumber = numberString ? parseInt(numberString, 10) : 0;
	if (Number.isNaN(myNumber) || myNumber < 0) myNumber = 0;

	return Math.min(myNumber, 99999);
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

export const allowedPingRoles = [
	`1416811955074891776`,
	`1425104014084673556`,
	`1422352173622366358`,
	`1416812117423816867`,
	`1419732188202533036`,
	`1425104189444460636`
];

export const pingMap: Record<string, Record<string, { label: string }>> = {
	vrc: {
		gaming: {
			label: "<@&1416811955074891776>",
		},
		social: {
			label: "<@&1425104014084673556>",
		},
		cinema: {
			label: "<@&1422352173622366358>",
		},
	},
	discord: {
		gaming: {
			label: "<@&1416812117423816867>",
		},
		social: {
			label: "<@&1419732188202533036>",
		},
		cinema: {
			label: "<@&1425104189444460636>",
		},
	}
};