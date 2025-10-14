import {
	Client,
	Guild,
	TextChannel,
	AnyThreadChannel,
	ChannelType,
	Message,
	User,
	GuildMember,
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