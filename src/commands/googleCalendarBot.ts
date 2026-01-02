import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, MessageFlags } from "discord.js";
import { PrismaClient, Event, eventSubType } from "@prisma/client";
import { calendarService } from "../helpers/googleCalendarService";
import { getStandardRolesAdmin, userHasAllowedRole } from "../helpers/securityHelpers";
import { writeLog } from "../helpers/logger";
import { EVENT_SUBTYPE_META } from "../helpers/eventSubTypes";
import { TrackedInteraction } from "../utils/interactionSystem";

const prisma = new PrismaClient();

type Action = "update" | "publish";

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

// --- /gsync Slash Command
module.exports = {
	data: new SlashCommandBuilder()
		.setName("gsync")
		.setDescription("Sync upcoming events to Google Calendar")
		.addBooleanOption(option =>
			option
				.setName("forced-refresh")
				.setDescription("Completely clear out the Google Calendar and re-add all events")
				.setRequired(false)
		),

	async execute(ix: TrackedInteraction) {
		await ix.deferReply({ ephemeral: true });

		// --- Permission check
		const hasPermission = userHasAllowedRole(
			ix.interaction.member as GuildMember,
			getStandardRolesAdmin()
		);
		if (!hasPermission) {
			writeLog(`User ${ix.interaction.user.tag} attempted to run /gsync without permission`);
			return ix.editReply("❌ You do not have permission to run this.");
		}

		const guildId = ix.guildId;
		if (!guildId) return ix.editReply("❌ Unable to determine guild ID.");

		try {
			const interaction = ix.interaction as ChatInputCommandInteraction;
			const forcedRefresh = interaction.options.getBoolean("forced-refresh") ?? false;

			if (forcedRefresh) {
				writeLog(`/gsync forced refresh started for guild ${guildId}`);
				// Clear both calendars
				const DRAFT_CALENDAR_ID = "b5e43c4baad5b852fc62fccdd8a98437a831e1e817f3548f293d82e589730fd9@group.calendar.google.com";
				const LIVE_CALENDAR_ID = "ffdb23af0ab9c09e29aa8b8a981e411997c5d79c9c6fc5daca735684d0c0d660@group.calendar.google.com";
				await clearGoogleCalendar(`${DRAFT_CALENDAR_ID}`);
				await clearGoogleCalendar(`${LIVE_CALENDAR_ID}`);
				writeLog(`/gsync forced refresh: calendars cleared for guild ${guildId}`);
			}

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

			const draftEvents = await getUpcomingDraftEvents(guildId);
			const draftCalendarEvents = await formatCalendarEvents(draftEvents, true);

			for (const e of draftCalendarEvents) {
				await createOrUpdateGoogleEvent(e, true);
				await sleep(250);
			}

			writeLog(`/gsync completed successfully for guild ${guildId}`);
			return ix.editReply(
				`✅ Successfully synced ${calendarEvents.length} events to Google Calendar.`
			);


		} catch (err) {
			writeLog(`Error during /gsync: ${(err as Error).message}`);
			return ix.editReply("❌ Failed to sync events. Check logs.");
		}
	},
	// expose helper functions so requiring this module doesn't lose named exports
	createOrUpdateGoogleEvent,
	formatCalendarEvents,
};

// --- Format events for Google Calendar
export async function formatCalendarEvents(events: Event[], draft: boolean = false): Promise<CalendarEvent[]> {
	const formattedEvents = [];

	// Preload signup counts to optimize
	// We might have just published a draft so we won't see this event id in signups yet
	const signupCounts = draft
		? [] : await prisma.eventSignUps.groupBy({
			by: ["eventId"],
			_count: { userId: true },
			where: { eventId: { in: events.map(e => e.id) } },
		});

	const countsMap: Record<number, number> = draft
		? {} : signupCounts.reduce((acc, cur) => {
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
			title: `${getEmojiFromSubtype(e.subtype as eventSubType)} ${e.title} (${totalSignedUp}/${totalCapacity})${draft ? "" : " [Draft]"}`,
			starts: e.startTime,
			ends: e.lengthMinutes ? new Date(e.startTime.getTime() + e.lengthMinutes * 60000) : null,
			type: e.type,
			subtype: e.subtype as eventSubType,
			description: description ?? "",
			color: getColourIdFromSubtype(e.subtype as eventSubType),
			publishedChannelId: e.publishedChannelId ?? "",
			publishedThreadId: e.publishedThreadId ?? "",
			googleEventId: e.googleEventId ?? null,
			published: draft ? false : true,
		});
	}

	return formattedEvents;
}

// --- Create or update Google Calendar event
export async function createOrUpdateGoogleEvent(event: CalendarEvent, draft: boolean = false, action: Action = "update") {
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
	writeLog(`Prepared request body for event ID ${event.id} google ID ${event.googleEventId} with Action: ${action}`);
	try {
		// --------------------------------------
		// PUBLISH: move from draft → live calendar
		// --------------------------------------
		if (action === "publish") {
			if (!event.googleEventId) {
				throw new Error("Cannot publish event without googleEventId");
			}
			writeLog("We're going to try and publish this event");
			// 1. Delete from draft calendar
			await calendarService.client.events.delete({
				calendarId: DRAFT_CALENDAR_ID,
				eventId: event.googleEventId,
			});

			writeLog(`Deleted draft Google event ${event.googleEventId}`);

			// 2. Insert into live calendar
			writeLog(`Inserting event into live calendar`);
			const res = await calendarService.client.events.insert({
				calendarId: LIVE_CALENDAR_ID,
				requestBody,
			});

			// 3. Store new Google event ID
			writeLog(`Updating prisma with new google event id ${event}`);
			await prisma.event.update({
				where: { id: event.id },
				data: {
					googleEventId: res.data.id,
					published: true, // if you track this
				},
			});
			writeLog(`Published event ${event.id} → new Google event ${res.data.id}`);
			return;
		}

		// --------------------------------------
		// UPDATE existing event
		// --------------------------------------
		writeLog(`Checking if we need to update existing event`);
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
		writeLog(`creating a new event`);
		const res = await calendarService.client.events.insert({
			calendarId,
			requestBody,
		});
		writeLog(`created new calendar event, now to update prisma`);
		await prisma.event.update({
			where: { id: event.id },
			data: { googleEventId: res.data.id },
		});

		writeLog(`Created new Google Calendar event ${res.data.id} for event ID ${event.id}`);
	} catch (err) {
		writeLog(`Error processing event ID ${event.id}: ${(err as Error).message}`);
		throw err;
	}
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
	writeLog(`syncCalendar Draft Events completed for guild ${guildId}`);
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Clear all events from a Google Calendar
async function clearGoogleCalendar(calendarId: string) {
	writeLog(`Clearing all events from calendar ${calendarId}`);

	try {
		// Fetch all events
		const eventsRes = await calendarService.client.events.list({
			calendarId,
			showDeleted: false,
			maxResults: 2500, // adjust if needed
			singleEvents: true,
		});

		const events = eventsRes.data.items ?? [];

		if (events.length === 0) {
			writeLog(`No events found in calendar ${calendarId}`);
			return;
		}

		writeLog(`Found ${events.length} events in calendar ${calendarId}, deleting...`);

		// Delete all events
		for (const event of events) {
			if (event.id) {
				await calendarService.client.events.delete({
					calendarId,
					eventId: event.id,
				});
				await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms between deletes
				writeLog(`Deleted event ${event.id}`);
			}
		}

		writeLog(`Finished clearing calendar ${calendarId}`);
	} catch (err) {
		writeLog(`Error clearing calendar ${calendarId}: ${(err as Error).message}`);
		throw err;
	}
}

function getColourIdFromSubtype(subtype: eventSubType): string {
	return EVENT_SUBTYPE_META[subtype].googleColorId;
}

function getEmojiFromSubtype(subtype: eventSubType): string {
	return EVENT_SUBTYPE_META[subtype].emoji;
}