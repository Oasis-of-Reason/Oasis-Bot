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