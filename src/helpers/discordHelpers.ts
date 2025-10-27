import {
	Client,
	Guild,
	TextChannel,
	AnyThreadChannel,
	ChannelType,
	Message,
	User,
	GuildMember,
	APIEmbed,
	EmbedBuilder,
} from "discord.js";

export async function fetchTextChannel(client: Client, id?: string | null): Promise<TextChannel | null> {
	if (!id) return null;
	const cached = client.channels.cache.get(id);
	if (cached?.type === ChannelType.GuildText) return cached as TextChannel;
	const fetched = await client.channels.fetch(id).catch(() => null);
	return fetched?.type === ChannelType.GuildText ? (fetched as TextChannel) : null;
}

export async function fetchThread(guild: Guild, id?: string | null): Promise<AnyThreadChannel | null> {
	if (!id) return null;
	const ch = await guild.channels.fetch(id).catch(() => null);
	if (!ch || (ch.type !== ChannelType.PublicThread && ch.type !== ChannelType.PrivateThread)) return null;
	const thread = ch as AnyThreadChannel;
	if (thread.archived) {
		try { await thread.setArchived(false, "Temporarily unarchive to edit event"); } catch { }
	}
	return thread;
}

export async function fetchMsgInChannel(channel: TextChannel, messageId?: string | null): Promise<Message | null> {
	if (!messageId) return null;
	return await channel.messages.fetch(messageId).catch(() => null);
}

export async function fetchMsgInThread(thread: AnyThreadChannel, messageId?: string | null): Promise<Message | null> {
	if (!messageId) return null;
	return await thread.messages.fetch(messageId).catch(() => null);
}

/** Accepts a User, GuildMember, or string (ID/mention) and returns a clean snowflake string. */
export function toSnowflake(target: string | User | GuildMember): string {
	if (typeof target !== "string") return target.id;
	// Strip <@...> or <@!...> and keep only digits
	const m = target.match(/\d{17,20}/);
	if (!m) throw new Error(`Invalid user reference: "${target}"`);
	return m[0];
}

/**
 * Checks if a message's first embed matches a given embed.
 * Returns true if they are deeply equivalent.
 */
export function messageEmbedEquals(
	message: Message,
	expected: APIEmbed | EmbedBuilder
): boolean {
	if (!message || !message.embeds || message.embeds.length === 0) return false;

	const actual = message.embeds[0];
	return embedsAreEqual(actual as APIEmbed, expected as APIEmbed);
}

/**
 * Deep equality check for two Discord embeds.
 * Works with EmbedBuilder, MessageEmbed, or raw APIEmbed objects.
 */
export function embedsAreEqual(a: APIEmbed, b: APIEmbed): boolean {
	// quick reference check
	if (a === b) return true;
	if (!a || !b) return false;

	// Convert to JSON if needed (EmbedBuilder or MessageEmbed)
	const embedA = typeof (a as any).toJSON === "function" ? (a as any).toJSON() : a;
	const embedB = typeof (b as any).toJSON === "function" ? (b as any).toJSON() : b;

	return deepEmbedEqual(embedA, embedB);
}

/**
 * Generic deep equality check that handles arrays, objects, and primitives.
 */
function deepEmbedEqual(a: any, b: any): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (!a || !b) return false;
	if (!(a.fields) || !(b.fields)) return false;

	// Handle objects
	if (typeof a === "object" && typeof b === "object") {
        if (a.fields.length !== b.fields.length)
            return false;
        for (let i = 0; i < a.fields.length; i++) {
            if(a.fields[i].value !== b.fields[i].value)
				return false;
        }
        return true;
    }

	// fallback for primitives
	return a === b;
}