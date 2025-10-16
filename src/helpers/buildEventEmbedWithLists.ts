import {
	EmbedBuilder,
	Client,
	GuildMember
} from "discord.js";
import { getPlatformsString, getRequirementsString, splitArray } from "./generalHelpers";
import { toSnowflake } from "./discordHelpers";

/** Build the event embed including attendees & cohosts lists. */
export async function buildEventEmbedWithLists(
	client: Client,
	publishingEvent: any,
	attendees: string[] = [],
	cohosts: string[] = []
) {
	const dt = new Date(publishingEvent.startTime);
	const unix = Math.floor(dt.getTime() / 1000);

	const guild = await client.guilds.fetch(publishingEvent.guildId);
	await guild.members.fetch();

	const attendeeNames = await Promise.all(
		attendees.map(async id => {
			const snowflake = toSnowflake(id);
			const member = await guild.members.cache.get(snowflake) ?? await guild.members.fetch(snowflake);
			const rawName = member?.nickname || member?.user.displayName || "(No Name)";
			return rawName;
		})
	);

	const attendeeNamesSplit = splitArray(attendeeNames, publishingEvent.capacityCap);

	const hostUser = await guild.members.cache.get(publishingEvent.hostId) as GuildMember;
	const hostName = hostUser.nickname || hostUser?.displayName || "-";
	/*
	// Resolve cohosts to nicknames
	let cohostNames = await Promise.all(
		cohosts.map(async id => {
			const snowflake = toSnowflake(id);
			const member = guild.members.cache.get(snowflake) ?? await guild.members.fetch(snowflake);
			const rawName = member?.nickname || member?.user.displayName || "(No Name)";
			return rawName;
		})
	);
	*/
	const embed = new EmbedBuilder()
		.setTitle(publishingEvent.title)
		.setColor(0x5865f2)
		.setDescription((publishingEvent.description ?? "No description provided."))
		.setAuthor({
			name: `Hosted By: ${hostName}`,
			iconURL: hostUser.user.displayAvatarURL({ forceStatic: false, size: 64 }),
		})

	// Only add Requirements if present
	if (publishingEvent.requirements && publishingEvent.requirements.trim() !== "") {
		embed.addFields({
			name: "Requirements",
			value: `> ${getRequirementsString(publishingEvent.requirements)}`,
			inline: true,
		});
	}

	if (publishingEvent.subtype) {
		embed.addFields({
			name: "Type",
			value: "> " + publishingEvent.subtype,
			inline: true,
		});
	}

	if (publishingEvent.scope) {
		embed.addFields({
			name: "Instance Type",
			value: publishingEvent.scope === "Group" ? "> Group Only" : "> Group Plus",
			inline: true,
		});
	}

	if (publishingEvent.platforms) {
		embed.addFields({
			name: "Platforms",
			value: `> ${getPlatformsString(publishingEvent.platforms)}`,
			inline: false,
		});
	}

	embed.addFields(
		{
			name: "Duration",
			value: `> ${publishingEvent.lengthMinutes} minutes`,
			inline: false,
		});

	embed.addFields(
		{
			name: "Start Time",
			value: `> <t:${unix}:f> (<t:${unix}:R>)`,
			inline: false,
		});
	
	embed.addFields({
		name: `Attendees (${attendeeNamesSplit[0].length}` + (publishingEvent.capacityCap > 0 ? `/${publishingEvent.capacityCap})` : `)`),
		value: attendeeNamesSplit[0].length > 0 ? "> " + attendeeNamesSplit[0].join("\n> ") : "> —",
		inline: true,
	});

	if (attendeeNamesSplit[1].length > 0) {
		embed.addFields({
			name: `Waiting List (${attendeeNamesSplit[1].length})`,
			value: "> " + attendeeNamesSplit[1].join("\n> "),
			inline: true,
		});
	}

	if (publishingEvent.imageUrl) {
		embed.setImage(publishingEvent.imageUrl);
	}

	return embed;
}