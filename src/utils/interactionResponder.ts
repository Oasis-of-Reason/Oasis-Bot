import {
	ChatInputCommandInteraction,
	ButtonInteraction,
	StringSelectMenuInteraction,
	ModalSubmitInteraction,
	InteractionReplyOptions,
	InteractionEditReplyOptions,
	MessagePayload,
	Interaction,
} from "discord.js";

type AnyInteraction =
	| ChatInputCommandInteraction
	| ButtonInteraction
	| StringSelectMenuInteraction
	| ModalSubmitInteraction;

type ReplyPayload = string | MessagePayload | InteractionReplyOptions;
type EditPayload = string | MessagePayload | InteractionEditReplyOptions;

export type InteractionTag = string;

type HistoryEntry = {
	at: number; // Date.now()
	action:
	| "deferReply"
	| "reply"
	| "editReply"
	| "followUp"
	| "deferUpdate"
	| "update";
	tag?: string;
	note?: string;
	callsite?: string;
};

function getCallsite(skip = 3): string {
	// get the stack line that called into our wrapper
	const stack = new Error().stack?.split("\n") ?? [];
	return (stack[skip] ?? "").trim();
}

function nowISO() {
	return new Date().toISOString();
}

export class InteractionRegistry {
	private static map = new Map<string, TrackedInteraction>();

	static set(t: TrackedInteraction) {
		this.map.set(t.id, t);
	}

	static get(id: string) {
		return this.map.get(id);
	}

	static delete(id: string) {
		this.map.delete(id);
	}

	static size() {
		return this.map.size;
	}

	static dumpRecent(limit = 25) {
		const arr = [...this.map.values()]
			.sort((a, b) => b.createdAtMs - a.createdAtMs)
			.slice(0, limit);

		for (const t of arr) {
			console.log(
				`[InteractionRegistry] ${t.id} type=${t.type} guild=${t.guildId ?? "n/a"} user=${t.userId
				} deferred=${t.deferred} replied=${t.replied} tags=[${t.tags.join(", ")}] ageMs=${Date.now() - t.createdAtMs
				}`
			);
			if (t.history.length) {
				const last = t.history[t.history.length - 1];
				console.log(
					`  last=${last.action} at=${new Date(last.at).toISOString()} note=${last.note ?? ""} tag=${last.tag ?? ""
					} callsite=${last.callsite ?? ""}`
				);
			}
		}
	}
}

export class TrackedInteraction {
	public readonly interaction: AnyInteraction;

	public readonly id: string;
	public readonly type: string;
	public readonly createdAtMs: number;

	public readonly guildId?: string;
	public readonly channelId?: string;
	public readonly userId: string;

	public deferred = false;
	public replied = false;

	public tags: InteractionTag[] = [];
	public notes: string[] = [];
	public history: HistoryEntry[] = [];

	constructor(interaction: AnyInteraction, tag?: string, note?: string) {
		this.interaction = interaction;
		this.id = interaction.id;
		this.type = interaction.type?.toString?.() ?? interaction.constructor.name;
		this.createdAtMs = Date.now();

		this.guildId = interaction.guildId ?? undefined;
		this.channelId = interaction.channelId ?? undefined;
		this.userId = interaction.user?.id ?? "unknown";

		if (tag) this.tags.push(tag);
		if (note) this.notes.push(note);

		InteractionRegistry.set(this);
	}

	public addTag(tag: InteractionTag) {
		this.tags.push(tag);
	}

	public addNote(note: string) {
		this.notes.push(note);
	}

	private logWarn(msg: string, extra?: any) {
		console.warn(
			`[TrackedInteraction WARN ${nowISO()}] ${msg} :: id=${this.id} guild=${this.guildId ?? "n/a"
			} user=${this.userId} deferred=${this.deferred} replied=${this.replied
			} tags=[${this.tags.join(", ")}] notes=[${this.notes.join(" | ")}]`,
			extra ?? ""
		);
	}

	private pushHistory(entry: Omit<HistoryEntry, "at">) {
		this.history.push({
			at: Date.now(),
			...entry,
		});
	}

	/**
	 * Defer a reply (for slash commands / modal submit).
	 * Safe: will not throw if already replied/deferred; logs instead.
	 */
	public async defer(opts?: { ephemeral?: boolean; tag?: string; note?: string }) {
		const callsite = getCallsite();

		// if already replied, deferring makes no sense
		if (this.replied) {
			this.logWarn("Attempted deferReply after reply()", { opts, callsite });
			this.pushHistory({ action: "deferReply", tag: opts?.tag, note: opts?.note, callsite });
			return false;
		}

		// if already deferred, no-op
		if (this.deferred) {
			this.logWarn("Attempted deferReply twice", { opts, callsite });
			this.pushHistory({ action: "deferReply", tag: opts?.tag, note: opts?.note, callsite });
			return false;
		}

		this.pushHistory({ action: "deferReply", tag: opts?.tag, note: opts?.note, callsite });

		try {
			await this.interaction.deferReply({ ephemeral: opts?.ephemeral });
			this.deferred = true;
			return true;
		} catch (err) {
			this.logWarn("deferReply threw", { err, opts, callsite });
			throw err;
		}
	}

	/**
	 * Reply once.
	 * If already replied, logs a warning and returns false.
	 * If deferred, uses editReply unless you force followUp.
	 */
	public async reply(payload: ReplyPayload, opts?: { tag?: string; note?: string; forceFollowUp?: boolean }) {
		const callsite = getCallsite();

		if (this.replied) {
			this.logWarn("Attempted reply() after already replied", { payload, opts, callsite });
			this.pushHistory({ action: "reply", tag: opts?.tag, note: opts?.note, callsite });
			return false;
		}

		// If we deferred, typical correct behavior is editReply.
		if (this.deferred && !opts?.forceFollowUp) {
			this.pushHistory({ action: "editReply", tag: opts?.tag, note: opts?.note, callsite });
			try {
				await this.interaction.editReply(payload as any);
				this.replied = true; // editReply after defer is the "first reply"
				return true;
			} catch (err) {
				this.logWarn("editReply (from reply) threw", { err, payload, opts, callsite });
				throw err;
			}
		}

		this.pushHistory({ action: "reply", tag: opts?.tag, note: opts?.note, callsite });
		try {
			await this.interaction.reply(payload as any);
			this.replied = true;
			return true;
		} catch (err) {
			this.logWarn("reply threw", { err, payload, opts, callsite });
			throw err;
		}
	}

	/**
	 * Edit the original reply. Requires defer() or reply() first in Discord terms.
	 * If not deferred/replied, logs warning and returns false.
	 */
	public async editReply(payload: EditPayload, opts?: { tag?: string; note?: string }) {
		const callsite = getCallsite();

		if (!this.deferred && !this.replied) {
			this.logWarn("Attempted editReply() before defer/reply", { payload, opts, callsite });
			this.pushHistory({ action: "editReply", tag: opts?.tag, note: opts?.note, callsite });
			return false;
		}

		this.pushHistory({ action: "editReply", tag: opts?.tag, note: opts?.note, callsite });
		try {
			await this.interaction.editReply(payload as any);
			this.replied = true; // treat editReply as "we have a visible response"
			return true;
		} catch (err) {
			this.logWarn("editReply threw", { err, payload, opts, callsite });
			throw err;
		}
	}

	/**
	 * Follow-up messages are always allowed after initial reply/defer.
	 * If called before, we log and attempt reply instead.
	 */
	public async followUp(payload: ReplyPayload, opts?: { tag?: string; note?: string }) {
		const callsite = getCallsite();

		this.pushHistory({ action: "followUp", tag: opts?.tag, note: opts?.note, callsite });

		// If nothing happened yet, followUp will usually error. So we "upgrade" it.
		if (!this.deferred && !this.replied) {
			this.logWarn("followUp() called before defer/reply; falling back to reply()", { payload, opts, callsite });
			return this.reply(payload, { tag: opts?.tag, note: opts?.note });
		}

		try {
			await this.interaction.followUp(payload as any);
			return true;
		} catch (err) {
			this.logWarn("followUp threw", { err, payload, opts, callsite });
			throw err;
		}
	}

	public dispose() {
		InteractionRegistry.delete(this.id);
	}
}

export function trackInteraction(interaction: AnyInteraction, tag?: string, note?: string) {
	return new TrackedInteraction(interaction, tag, note);
}
