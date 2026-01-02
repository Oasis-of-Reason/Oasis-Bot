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
	APIContainerComponent,
} from "discord.js";
import { emojiMapTypes } from "./generalConstants";
import { prisma } from "../utils/prisma";

/**
 * Compare a message's Components v2 container content to an expected container.
 * Returns true if the visible text content (and separator positions) are the same.
 */
export function messageContainerEquals(
	message: Message,
	expected:
		| { components: APIContainerComponent[] }             // full payload you send
		| APIContainerComponent[]                             // components array
		| APIContainerComponent                               // single container root
		| { toJSON(): APIContainerComponent }                 // ContainerBuilder-like
): boolean {
	if (!message) return false;

	// Actual components from the fetched message (discord.js may expose it under different props).
	const actualComponents =
		// some builds: message.componentsV2 -> APIContainerComponent[]
		(asAny(message).componentsV2 as APIContainerComponent[] | undefined) ??
		// others: message.components is already the array of root components
		(asAny(message).components as APIContainerComponent[] | undefined) ??
		// last resort: try the raw JSON
		(tryGetJsonComponents(message) ?? []);

	const expectedComponents = normalizeExpected(expected);

	const actualText = extractRenderableText(actualComponents);
	const expectedText = extractRenderableText(expectedComponents);

	if (actualText.length !== expectedText.length) return false;
	for (let i = 0; i < actualText.length; i++) {
		if (replaceEmojiText(actualText[i]) !== expectedText[i]) return false;
	}
	return true;
}

/**
 * Deep-ish equality for two container payloads, based on renderable text.
 * You can use this directly if you already hold both containers.
 */
export function containersAreEqual(
	a: APIContainerComponent[] | APIContainerComponent,
	b: APIContainerComponent[] | APIContainerComponent
): boolean {
	const aText = extractRenderableText(Array.isArray(a) ? a : [a]);
	const bText = extractRenderableText(Array.isArray(b) ? b : [b]);
	if (aText.length !== bText.length) return false;
	for (let i = 0; i < aText.length; i++) {
		if (aText[i] !== bText[i]) return false;
	}
	return true;
}



/**
 * Replace any exact emojiText (e.g. ":DiscordLogo:") with its emoji markup.
 */
export function replaceEmojiText(input: string): string {
	// Build lookup: emojiText -> emoji
	const map: Record<string, string> = {};
	for (const { emojiText, emoji } of Object.values(emojiMapTypes)) {
		map[emojiText] = emoji;
	}

	// Single regex that matches any emojiText exactly
	const pattern = Object.keys(map)
		.map(escapeRegex)
		.sort((a, b) => b.length - a.length) // longest first (safety if any overlap)
		.join("|");

	if (!pattern) return input;

	const re = new RegExp(`(${pattern})`, "g");
	return input.replace(re, (match) => map[match]);
}


export async function fetchTextChannel(client: Client, id?: string | null): Promise<TextChannel | null> {
	if (!id) return null;
	const cached = client.channels.cache.get(id);
	if (cached?.type === ChannelType.GuildText) return cached as TextChannel;
	const fetched = await client.channels.fetch(id).catch(() => null);
	return fetched?.type === ChannelType.GuildText ? (fetched as TextChannel) : null;
}

export async function fetchThread(guild: Guild, id?: string | null): Promise<AnyThreadChannel | null> {
	if (!id) return null;
	const ch = await guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
	if (!ch || (ch.type !== ChannelType.PublicThread && ch.type !== ChannelType.PrivateThread)) return null;
	const thread = ch as AnyThreadChannel;
	if (thread.archived) {
		try { await thread.setArchived(false, "Temporarily unarchive to edit event"); } catch { }
	}
	return thread;
}

export async function fetchMsgInChannel(channel: TextChannel, messageId?: string | null): Promise<Message | null> {
	if (!messageId) return null;
	return await channel.messages.cache.get(messageId) ?? await channel.messages.fetch(messageId).catch(() => null);
}

export async function fetchMsgInThread(thread: AnyThreadChannel, messageId?: string | null): Promise<Message | null> {
	if (!messageId) return null;
	return await thread.messages.cache.get(messageId) ?? await thread.messages.fetch(messageId).catch(() => null);
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

export async function giveRoleToUser(
	guild: Guild,
	userId: string,
	roleId: string
): Promise<"ok" | "no-member" | "no-role" | "no-permission" | "error"> {
	try {
		// Fetch member (ensures latest data)
		const member = await guild.members.fetch(userId).catch(() => null);
		if (!member) return "no-member";

		// Ensure the role exists
		const role = guild.roles.cache.get(roleId);
		if (!role) return "no-role";

		// Check bot permissions
		const botMember = guild.members.me;
		if (!botMember) return "no-permission";

		// Bot must be ABOVE the role it is trying to give
		if (role.position >= botMember.roles.highest.position) {
			return "no-permission";
		}

		// Give the role
		await member.roles.add(roleId);
		return "ok";

	} catch (err) {
		console.error("Failed to assign role:", err);
		return "error";
	}
}

export async function removeRoleFromUser(
	guild: Guild,
	userId: string,
	roleId: string
): Promise<"ok" | "no-member" | "no-role" | "no-permission" | "error"> {
	try {
		// Fetch the guild member
		const member = await guild.members.fetch(userId).catch(() => null);
		if (!member) return "no-member";

		// Validate role exists
		const role = guild.roles.cache.get(roleId);
		if (!role) return "no-role";

		// Permission & hierarchy check
		const botMember = guild.members.me;
		if (!botMember) return "no-permission";

		// Bot must be above the role to remove it
		if (role.position >= botMember.roles.highest.position) {
			return "no-permission";
		}

		// Remove the role
		await member.roles.remove(roleId);
		return "ok";

	} catch (err) {
		console.error("Failed to remove role:", err);
		return "error";
	}
}

export async function getVrcGroupId(guildId: string): Promise<string | null> {
	const config = await prisma.guildConfig.findUnique({
		where: { id: guildId },
		select: { vrcGroupId: true },
	});

	return config?.vrcGroupId ?? null;
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
			if (a.fields[i].value !== b.fields[i].value)
				return false;
		}
		return true;
	}

	// fallback for primitives
	return a === b;
}

function asAny<T = any>(v: unknown): T {
	return v as T;
}

function tryGetJsonComponents(message: Message): APIContainerComponent[] | null {
	try {
		const json = asAny(message).toJSON?.();
		if (json?.components && Array.isArray(json.components)) {
			return json.components as APIContainerComponent[];
		}
	} catch { }
	return null;
}

function normalizeExpected(
	expected:
		| { components: APIContainerComponent[] }
		| APIContainerComponent[]
		| APIContainerComponent
		| { toJSON(): APIContainerComponent }
): APIContainerComponent[] {
	if (Array.isArray(expected)) return expected;
	if (isContainerRoot(expected)) return [expected];
	if (hasComponentsArray(expected)) return expected.components;
	if (hasToJSON(expected)) return [expected.toJSON()];
	throw new Error("Unsupported expected container shape.");
}

function hasComponentsArray(
	v: unknown
): v is { components: APIContainerComponent[] } {
	return !!v && typeof v === "object" && Array.isArray((v as any).components);
}

function isContainerRoot(v: unknown): v is APIContainerComponent {
	// A root container typically has a "components" (children) array or a "type/kind" identifying it
	return !!v && typeof v === "object" && (Array.isArray((v as any).components) || "type" in (v as any) || "kind" in (v as any));
}

function hasToJSON(v: unknown): v is { toJSON(): APIContainerComponent } {
	return !!v && typeof (v as any).toJSON === "function";
}

/**
 * Extract a flat list of "renderable slices" from a container:
 * - Text blocks: their content string
 * - Separators: a special sentinel "———SEP———"
 * Other component types are ignored for text equivalence.
 */
function extractRenderableText(roots: APIContainerComponent[]): string[] {
	const out: string[] = [];
	const stack = [...roots];

	while (stack.length) {
		const node: any = stack.shift();

		// Dive into children if present (common shape: { components: [...] })
		if (node && Array.isArray(node.components)) {
			// Keep order
			for (const child of node.components) stack.push(child);
			continue;
		}

		// TextDisplay variants:
		// Accept a few shapes defensively: { text: { content } } or { content } or { data: { content } }
		const content =
			node?.text?.content ??
			node?.content ??
			node?.data?.content ??
			null;

		if (typeof content === "string") {
			out.push(content.trim());
			continue;
		}

		// Separator variants: { type: "separator" } or { kind: "separator" }
		const t = (node?.type ?? node?.kind ?? "").toString().toLowerCase();
		if (t.includes("separator")) {
			out.push("———SEP———");
			continue;
		}

		// Non-text, non-separator components are ignored for "content equality"
	}

	// Collapse duplicate neighboring separators (optional tidy)
	for (let i = out.length - 2; i >= 0; i--) {
		if (out[i] === "———SEP———" && out[i + 1] === "———SEP———") {
			out.splice(i + 1, 1);
		}
	}

	return out;
}

function escapeRegex(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}