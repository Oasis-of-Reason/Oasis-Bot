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

// --- Create or update Google Calendar event
async function createOrUpdateGoogleEvent(event: CalendarEvent) {
	writeLog(`Processing event ID ${event.id} - ${event.title}`);
	const calendarId = "ffdb23af0ab9c09e29aa8b8a981e411997c5d79c9c6fc5daca735684d0c0d660@group.calendar.google.com";
	writeLog(`CalendarEvent value: ${JSON.stringify(event)}`);

	const requestBody = {
		summary: event.title,
		colorId: event.color,
		start: { dateTime: event.starts.toISOString() },
		end: { dateTime: event.ends?.toISOString() ?? event.starts.toISOString() },
		description: `${event.description}`,
		extendedProperties: { private: { prismaEventId: event.id.toString() } },
	};

	try {
		if (event.googleEventId) {
			await calendarService.client.events.update({
				calendarId,
				eventId: event.googleEventId,
				requestBody,
			});
			writeLog(`Updated Google Calendar event ${event.googleEventId}`);
		} else {
			const res = await calendarService.client.events.insert({
				calendarId,
				requestBody,
			});
			await prisma.event.update({
				where: { id: event.id },
				data: { googleEventId: res.data.id },
			});
			writeLog(`Created new Google Calendar event ${res.data.id} for event ID ${event.id}`);
		}
	} catch (err) {
		writeLog(`Error processing event ID ${event.id}: ${(err as Error).message}`);
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
			writeLog(`Running /gsync for guild ${guildId}`);
			const events = await getUpcomingEvents(guildId);
			const calendarEvents = await formatCalendarEvents(events);

			for (const e of calendarEvents) {
				await createOrUpdateGoogleEvent(e);
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
