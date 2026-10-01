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
	console.log(`Building event embed for event ${publishingEvent.id} with ${attendees.length} attendees and ${cohosts.length} cohosts.`);
	const dt = new Date(publishingEvent.startTime);
	const unix = Math.floor(dt.getTime() / 1000);

	const guild = await client.guilds.fetch(publishingEvent.guildId);
	const hostUser = await guild.members.cache.get(publishingEvent.hostId) as GuildMember || await guild.members.fetch(publishingEvent.hostId) as GuildMember;

	const attendeeNames = await Promise.all(
		attendees.map(async id => {
			const snowflake = toSnowflake(id);
			const member = await guild.members.cache.get(snowflake) || await guild.members.fetch(snowflake);
			const rawName = member?.nickname || member?.user.displayName || "(No Name)";
			return rawName;
		})
	);

	const attendeeNamesSplit = publishingEvent.capacityCap === 0 ? [attendeeNames, []] : splitArray(attendeeNames, publishingEvent.capacityCap);

	const hostName = hostUser.nickname || hostUser?.displayName || "-";
	const hostMember = await guild.members.fetch(hostUser.id);
	const hostId = `${hostMember.id}`;

	// Resolve cohosts to nicknames
	let cohostNames = await Promise.all(
		cohosts.map(async id => {
			const snowflake = toSnowflake(id);
			const member =
				guild.members.cache.get(snowflake) ??
				await guild.members.fetch(snowflake).catch(() => null);
			if (member) {
				return `<@${member.id}>`;
			}
			try {
				const discordUser = await client.users.fetch(snowflake);
				return discordUser.globalName || discordUser.username;
			} catch (err) {
				console.warn(`Failed to fetch cohost ${id} from Discord:`, err);
				return "(Unknown User)";
			}
		})
	);

	console.log(`Cohost names resolved for event ${publishingEvent.id}:`, cohostNames);

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

	if (publishingEvent.platforms && publishingEvent.platforms.length > 0 && publishingEvent.platforms != "[]") {
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

	if (cohostNames.length > 0) {
		embed.addFields({
			name: `Hosts`,
			value: "> <@" + hostId + ">\n> Co: " + cohostNames.join("\n> Co: "),
			inline: true,
		});
	}

	const shortDescription = publishingEvent.description ? (publishingEvent.description.length > 100 ? publishingEvent.description.substring(0, 100) + "..." : publishingEvent.description) : "No description provided.";
	const calendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(publishingEvent.title.replace(/\(/g,"%28").replace(/\)/g,"%29"))}&location=${encodeURIComponent(guild.name)}&dates=${dt.toISOString().replace(/-|:|\.\d+/g, '')}/${new Date(dt.getTime() + publishingEvent.lengthMinutes * 60000).toISOString().replace(/-|:|\.\d+/g, '')}&details=${encodeURIComponent(shortDescription.replace(/\(/g,"").replace(/\)/g,"") || '')}`;
	//const calendarUrl = `https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(publishingEvent.title)}&dates=${dt.toISOString().replace(/-|:|\.\d+/g, '')}/${new Date(dt.getTime() + publishingEvent.lengthMinutes * 60000).toISOString().replace(/-|:|\.\d+/g, '')}&details=${encodeURIComponent(publishingEvent.description || '')}&sf=true&output=xml`;
	embed.addFields(
		{
			name: "Start Time",
			value: `> <t:${unix}:F> (<t:${unix}:R>) \n> [ + Add to calendar ](${calendarUrl})`,
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