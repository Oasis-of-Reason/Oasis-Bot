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
	const hostUser: User = await client.users.fetch(publishingEvent.hostId);

	// Get the guild so we can resolve nicknames
	const guild = await client.guilds.fetch(publishingEvent.guildId);
	await guild.members.fetch();

	// Resolve attendees to nicknames (or usernames if no nickname)
	const attendeeNames = await Promise.all(
		attendees.map(async id => {
			const snowflake = toSnowflake(id);
			const member = await guild.members.cache.get(snowflake) ?? await guild.members.fetch(snowflake);
			const rawName = member?.nickname || member?.user.username || "(No Name)";
			return rawName.charAt(0).toUpperCase() + rawName.slice(1);
		})
	);

	// Resolve cohosts to nicknames
	const cohostNames = await Promise.all(
		cohosts.map(async c => {
			const member = guild.members.cache.get(c.userId) ?? await guild.members.fetch(c.userId);
			const rawName = member?.nickname || member?.user.username || c.userId;
			return rawName.charAt(0).toUpperCase() + rawName.slice(1);
		})
	);

	const embed = new EmbedBuilder()
		.setTitle(publishingEvent.title)
		.setColor(0x5865f2)
		.setDescription(publishingEvent.description ?? "No description provided.")
		.setAuthor({
			name: `Hosted By: ${hostUser.username.charAt(0).toUpperCase() + hostUser.username.slice(1)}`,
			iconURL: hostUser.displayAvatarURL({ forceStatic: false, size: 64 }),
		})
		.addFields(
			{
				name: `Attendees (${attendeeNames.length}/${publishingEvent.capacityCap})`,
				value: attendeeNames.length > 0 ? attendeeNames.join("\n") : "—",
				inline: false,
			},
			{
				name: "Scope",
				value: publishingEvent.scope ?? "—",
				inline: true,
			},
			{
				name: "Start Time",
				value: `<t:${unix}:f> (<t:${unix}:R>)`,
				inline: true,
			}
		);

	// Only add Requirements if present
	if (publishingEvent.Requirements && publishingEvent.Requirements.trim() !== "") {
		embed.addFields({
			name: "Requirements",
			value: publishingEvent.Requirements,
			inline: true,
		});
	}

	// Only add CoHosts if present (comma separated)
	if (cohostNames.length > 0) {
		embed.addFields({
			name: "CoHosts",
			value: cohostNames.join(", "),
			inline: false,
		});
	}

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