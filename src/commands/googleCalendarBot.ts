import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, MessageFlags } from "discord.js";
import { PrismaClient, Event, eventSubType } from "@prisma/client";
import { calendarService } from "../helpers/googleCalendarService";
import { getStandardRolesAdmin, userHasAllowedRole } from "../helpers/securityHelpers";
import { writeLog } from "../helpers/logger";
import { EVENT_SUBTYPE_META } from "../helpers/eventSubTypes";

const prisma = new PrismaClient();

function getColourIdFromSubtype(subtype: eventSubType): string {
	return EVENT_SUBTYPE_META[subtype].googleColorId;
}

// --- Format events for Google Calendar
export async function formatCalendarEvents(events: Event[]) {
	const formattedEvents = [];

	// Preload signup counts to optimize
	const signupCounts = await prisma.eventSignUps.groupBy({
		by: ["eventId"],
		_count: { userId: true },
		where: { eventId: { in: events.map(e => e.id) } },
	});
	const countsMap = signupCounts.reduce((acc, cur) => {
		acc[cur.eventId] = cur._count.userId;
		return acc;
	}, {} as Record<number, number>);

	for (const e of events) {
		const totalSignedUp = countsMap[e.id] ?? 0;
		const totalCapacity = e.capacityCap;
		const threadlink = `https://discord.com/channels/${e.guildId}/${e.publishedChannelId}/${e.publishedThreadId}`;
		const description = `${e.description ? e.description.substring(0, 700) + "..." : ""} + ${e.published ? `\n\nDiscord Direct Link:\n ${threadlink}` : ""}`;
		formattedEvents.push({
			id: e.id,
			dbguildId: parseInt(e.guildId),
			title: `${e.title} (${totalSignedUp}/${totalCapacity})${e.published ? "" : " [Draft]"}`,
			starts: e.startTime,
			ends: e.lengthMinutes ? new Date(e.startTime.getTime() + e.lengthMinutes * 60000) : null,
			type: e.type,
			subtype: e.subtype as eventSubType,
			description: description ?? "",
			color: getColourIdFromSubtype(e.subtype as eventSubType),
			publishedChannelId: e.publishedChannelId ?? "",
			publishedThreadId: e.publishedThreadId ?? "",
			googleEventId: e.googleEventId ?? null,
			published: e.published,
		});
	}

	return formattedEvents;
}

// --- Fetch upcoming events
async function getUpcomingEvents(guildId: string): Promise<Event[]> {
	writeLog(`Fetching upcoming events for guild ${guildId}`);
	const events = await prisma.event.findMany({
		where: {
			guildId,
			startTime: {
				gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14), // last 14 days
				lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 28), // next 28 days
			},
			published: true,
		},
		orderBy: { startTime: "asc" },
	});
	writeLog(`Fetched ${events.length} events for guild ${guildId}`);
	return events;
}

// --- Fetch upcoming events
async function getUpcomingDraftEvents(guildId: string): Promise<Event[]> {
	writeLog(`Fetching upcoming draft events for guild ${guildId}`);
	const events = await prisma.event.findMany({
		where: {
			guildId,
			startTime: {
				gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14), // last 14 days
				lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 28), // next 28 days
			},
			published: false,
		},
		orderBy: { startTime: "asc" },
	});
	writeLog(`Fetched ${events.length} events for guild ${guildId}`);
	return events;
}

// --- Calendar Event interface
interface CalendarEvent {
	id: number;
	dbguildId: number;
	title: string;
	starts: Date;
	ends: Date | null;
	type: string;
	subtype: string;
	description: string;
	color: string;
	publishedChannelId: string,
	publishedThreadId: string,
	googleEventId: string | null;
	published: boolean;
}
// Pull list of all events from calendar and match against database
// remove from calendar if not in database

async function syncCalendarEvents(guildId: string) {
	const calendarId = "ffdb23af0ab9c09e29aa8b8a981e411997c5d79c9c6fc5daca735684d0c0d660@group.calendar.google.com";

	writeLog(`Starting syncCalendarEvents for guild ${guildId}`);

	// 1️⃣ Fetch all Google Calendar events
	const res = await calendarService.client.events.list({
		calendarId,
		timeMin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
		timeMax: new Date(Date.now() + 1000 * 60 * 60 * 24 * 28).toISOString(),
		maxResults: 2500,
	});

	const calendarItems = res.data.items ?? [];

	// 2️⃣ Build map: prismaEventId -> googleEventId
	const calendarMap = new Map<number, string>();
	for (const item of calendarItems) {
		const prismaId = item.extendedProperties?.private?.prismaEventId;
		const googleId = item.id;
		if (prismaId && googleId) {
			calendarMap.set(parseInt(prismaId), googleId);
		}
	}

	writeLog(`Fetched ${calendarMap.size} events from Google Calendar.`);

	// 3️⃣ Fetch all DB events
	const dbEvents = await getUpcomingEvents(guildId);
	const dbEventIds = new Set(dbEvents.map(e => e.id));

	writeLog(`Fetched ${dbEventIds.size} events from DB.`);

	// 4️⃣ Compare and delete calendar events that no longer exist in DB
	for (const [prismaId, googleEventId] of calendarMap.entries()) {
		if (!dbEventIds.has(prismaId)) {
			try {
				await calendarService.client.events.delete({
					calendarId,
					eventId: googleEventId,
				});
				writeLog(
					`Deleted Google Calendar event ${googleEventId} (prismaEventId=${prismaId}) as it no longer exists in DB.`
				);

				// Optional: simple rate-limit delay to avoid quota errors
				await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms between deletes
			} catch (err) {
				writeLog(
					`Failed to delete Google Calendar event ${googleEventId} (prismaEventId=${prismaId}): ${(err as Error).message}`
				);
			}
		}
	}

	writeLog(`syncCalendarEvents completed for guild ${guildId}`);
}

async function syncCalendarDraftEvents(guildId: string) {
	const calendarId = "b5e43c4baad5b852fc62fccdd8a98437a831e1e817f3548f293d82e589730fd9@group.calendar.google.com";

	writeLog(`Starting syncCalendarDraftEvents for guild ${guildId}`);

	// 1️⃣ Fetch all Google Calendar events
	const res = await calendarService.client.events.list({
		calendarId,
		timeMin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
		timeMax: new Date(Date.now() + 1000 * 60 * 60 * 24 * 28).toISOString(),
		maxResults: 2500,
	});

	const calendarItems = res.data.items ?? [];

	// 2️⃣ Build map: prismaEventId -> googleEventId
	const calendarMap = new Map<number, string>();
	for (const item of calendarItems) {
		const prismaId = item.extendedProperties?.private?.prismaEventId;
		const googleId = item.id;
		if (prismaId && googleId) {
			calendarMap.set(parseInt(prismaId), googleId);
		}
	}

	writeLog(`Fetched ${calendarMap.size} events from Google Calendar.`);

	// 3️⃣ Fetch all DB events
	const dbEvents = await getUpcomingDraftEvents(guildId);
	const dbEventIds = new Set(dbEvents.map(e => e.id));

	writeLog(`Fetched ${dbEventIds.size} events from DB.`);

	// 4️⃣ Compare and delete calendar events that no longer exist in DB
	for (const [prismaId, googleEventId] of calendarMap.entries()) {
		if (!dbEventIds.has(prismaId)) {
			try {
				await calendarService.client.events.delete({
					calendarId,
					eventId: googleEventId,
				});
				writeLog(
					`Deleted Google Calendar event ${googleEventId} (prismaEventId=${prismaId}) as it no longer exists in DB.`
				);

				// Optional: simple rate-limit delay to avoid quota errors
				await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms between deletes
			} catch (err) {
				writeLog(
					`Failed to delete Google Calendar event ${googleEventId} (prismaEventId=${prismaId}): ${(err as Error).message}`
				);
			}
		}
	}

	writeLog(`syncCalendarDraftEvents completed for guild ${guildId}`);
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

type Action = "update" | "publish";

// --- Create or update Google Calendar event
async function createOrUpdateGoogleEvent(event: CalendarEvent, draft: boolean = false, action: Action = "update") {
	writeLog(`Processing event ID ${event.id} - ${event.title}`);

	const DRAFT_CALENDAR_ID = "b5e43c4baad5b852fc62fccdd8a98437a831e1e817f3548f293d82e589730fd9@group.calendar.google.com";
	const LIVE_CALENDAR_ID = "ffdb23af0ab9c09e29aa8b8a981e411997c5d79c9c6fc5daca735684d0c0d660@group.calendar.google.com";
	const calendarId = draft ? DRAFT_CALENDAR_ID : LIVE_CALENDAR_ID;

	const requestBody = {
		summary: event.title,
		colorId: event.color,
		start: { dateTime: event.starts.toISOString() },
		end: { dateTime: event.ends?.toISOString() ?? event.starts.toISOString() },
		description: event.description ?? "",
		extendedProperties: {
			private: { prismaEventId: event.id.toString() },
		},
	};

	try {
		// --------------------------------------
		// PUBLISH: move from draft → live calendar
		// --------------------------------------
		if (action === "publish") {
			if (!event.googleEventId) {
				throw new Error("Cannot publish event without googleEventId");
			}

			// 1. Delete from draft calendar
			await calendarService.client.events.delete({
				calendarId: DRAFT_CALENDAR_ID,
				eventId: event.googleEventId,
			});

			writeLog(`Deleted draft Google event ${event.googleEventId}`);

			// 2. Insert into live calendar
			const res = await calendarService.client.events.insert({
				calendarId: LIVE_CALENDAR_ID,
				requestBody,
			});

			// 3. Store new Google event ID
			await prisma.event.update({
				where: { id: event.id },
				data: {
					googleEventId: res.data.id,
					published: true, // if you track this
				},
			});

			writeLog(
				`Published event ${event.id} → new Google event ${res.data.id}`
			);

			return;
		}

		// --------------------------------------
		// UPDATE existing event
		// --------------------------------------
		if (event.googleEventId) {
			await calendarService.client.events.update({
				calendarId,
				eventId: event.googleEventId,
				requestBody,
			});

			writeLog(`Updated Google Calendar event ${event.googleEventId}`);
			return;
		}

		// --------------------------------------
		// CREATE new event
		// --------------------------------------
		const res = await calendarService.client.events.insert({
			calendarId,
			requestBody,
		});

		await prisma.event.update({
			where: { id: event.id },
			data: { googleEventId: res.data.id },
		});

		writeLog(
			`Created new Google Calendar event ${res.data.id} for event ID ${event.id}`
		);
	} catch (err) {
		writeLog(
			`Error processing event ID ${event.id}: ${(err as Error).message}`
		);
		throw err;
	}
}


// --- /gsync Slash Command
module.exports = {
	data: new SlashCommandBuilder()
		.setName("gsync")
		.setDescription("Sync upcoming events to Google Calendar"),

	async execute(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		// --- Permission check
		const hasPermission = userHasAllowedRole(
			interaction.member as GuildMember,
			getStandardRolesAdmin()
		);
		if (!hasPermission) {
			writeLog(`User ${interaction.user.tag} attempted to run /gsync without permission`);
			return interaction.editReply("❌ You do not have permission to run this.");
		}

		const guildId = interaction.guildId;
		if (!guildId) return interaction.editReply("❌ Unable to determine guild ID.");

		try {
			writeLog("syncCalendarEvents started");
			await syncCalendarEvents(guildId);
			writeLog("syncCalendarEvents completed");

			writeLog("syncCalendarDraftEvents started");
			await syncCalendarDraftEvents(guildId);
			writeLog("syncCalendarDraftEvents completed");

			writeLog(`Running /gsync for guild ${guildId}`);
			const events = await getUpcomingEvents(guildId);
			const calendarEvents = await formatCalendarEvents(events);

			for (const e of calendarEvents) {
				await createOrUpdateGoogleEvent(e);
				await sleep(250);
			}

			writeLog(`/gsync completed successfully for guild ${guildId}`);
			return interaction.editReply(
				`✅ Successfully synced ${calendarEvents.length} events to Google Calendar.`
			);
		} catch (err) {
			writeLog(`Error during /gsync: ${(err as Error).message}`);
			return interaction.editReply("❌ Failed to sync events. Check logs.");
		}
	},
};
