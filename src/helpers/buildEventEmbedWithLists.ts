import {
	EmbedBuilder,
	Client,
	User,
	GuildMember
} from "discord.js";

/** Build the event embed including attendees & cohosts lists. */
export async function buildEventEmbedWithLists(
	client: Client,
	publishingEvent: any,
	attendees: string[] = [],
	cohosts: { userId: string }[] = []
) {
	const dt = new Date(publishingEvent.startTime);
	const unix = Math.floor(dt.getTime() / 1000);

	// Fetch host
	
	// Get the guild so we can resolve nicknames
	const guild = await client.guilds.fetch(publishingEvent.guildId);
	await guild.members.fetch();
	
	
	// Resolve attendees to nicknames (or usernames if no nickname)
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
	const hostName =  hostUser.nickname || hostUser?.displayName || "-";
	// Resolve cohosts to nicknames
	let cohostNames = await Promise.all(
		cohosts.map(async c => {
			const member = guild.members.cache.get(c.userId) ?? await guild.members.fetch(c.userId);
			const rawName = member?.nickname || member?.user.displayName || c.userId;
			return rawName;
		})
	);

	const embed = new EmbedBuilder()
		.setTitle(publishingEvent.title)
		.setColor(0x5865f2)
		.setDescription(publishingEvent.description ?? "No description provided.")
		.setAuthor({
			name: `Hosted By: ${hostName}`,
			iconURL: hostUser.user.displayAvatarURL({ forceStatic: false, size: 64 }),
		})
		
		// Only add Requirements if present
		if (publishingEvent.requirements && publishingEvent.requirements.trim() !== "") {
			embed.addFields({
				name: "Requirements",
				value: publishingEvent.requirements,
				inline: true,
			});
		}

		if(publishingEvent.subtype) {
			embed.addFields({
				name: "Type",
				value: publishingEvent.subtype,
				inline: true,
			});
		}

		if(publishingEvent.scope) {
			embed.addFields({
				name: "Scope",
				value: publishingEvent.scope === "Group" ? "Group Only" : "Group Plus",
				inline: true,
			});
		}

		if(publishingEvent.platforms) {
			embed.addFields({
				name: "Platforms",
				value: `:${(JSON.parse(publishingEvent.platforms) as string[]).join(": :")}:`.toLowerCase(),
				inline: false,
			});
		}

		embed.addFields(
		{
			name: "Duration",
			value: `${publishingEvent.lengthMinutes} minutes`,
			inline: false,
		});

		embed.addFields(
		{
			name: "Start Time",
			value: `<t:${unix}:f> (<t:${unix}:R>)`,
			inline: false,
		});
		attendeeNamesSplit
	embed.addFields({
		name: `Attendees (${attendeeNamesSplit[0].length}/${publishingEvent.capacityCap})`,
		value: attendeeNamesSplit[0].length > 0 ? attendeeNamesSplit[0].join("\n") : "—",
		inline: true,
	});
	if(attendeeNamesSplit[1].length > 0){
		embed.addFields( {
			name: `Waiting List (${attendeeNamesSplit[1].length})`,
			value: attendeeNamesSplit[1].join("\n"),
			inline: true,
		});
	}
	/*
	if (cohostNames.length > 0) {
		embed.addFields({
			name: `Hosts (${cohostNames.length+1})`,
			value: `**${hostName}**\n` + cohostNames.join("\n"),
			inline: true,
		});
	}
	*/
	if (publishingEvent.imageUrl) {
		embed.setImage(publishingEvent.imageUrl);
	}

	return embed;
}

/** Accepts a User, GuildMember, or string (ID/mention) and returns a clean snowflake string. */
function toSnowflake(target: string | User | GuildMember): string {
	if (typeof target !== "string") return target.id;
	// Strip <@...> or <@!...> and keep only digits
	const m = target.match(/\d{17,20}/);
	if (!m) throw new Error(`Invalid user reference: "${target}"`);
	return m[0];
}

function splitArray<T>(arr: T[], maxFirst: number): [T[], T[]] {
  const first = arr.slice(0, maxFirst);
  const second = arr.slice(maxFirst);
  return [first, second];
}