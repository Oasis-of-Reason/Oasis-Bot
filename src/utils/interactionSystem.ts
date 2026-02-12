import {
	Interaction,
	InteractionReplyOptions,
	InteractionEditReplyOptions,
	MessagePayload,
	ModalBuilder,
	RepliableInteraction,
	ButtonInteraction,
	AnySelectMenuInteraction,
	Message,
	InteractionCallbackResponse,
	ModalSubmitInteraction,
	AwaitModalSubmitOptions,
	MessageFlags
} from "discord.js";

type ReplyPayload = string | MessagePayload | InteractionReplyOptions;
type EditPayload = string | MessagePayload | InteractionEditReplyOptions;

type HistoryAction =
	| "deferReply"
	| "reply"
	| "editReply"
	| "followUp"
	| "deferUpdate"
	| "update"
	| "showModal"
	| "awaitModalSubmit";

type HistoryEntry = {
	at: number;
	action: HistoryAction;
	tag?: string;
	note?: string;
	callsite?: string;
};

function nowISO() {
	return new Date().toISOString();
}

function getCallsite(skip = 3): string {
	const stack = new Error().stack?.split("\n") ?? [];
	return (stack[skip] ?? "").trim();
}

function isRepliable(i: Interaction): i is RepliableInteraction {
	return i.isRepliable();
}

type AnyMessageComponentInteraction = ButtonInteraction | AnySelectMenuInteraction;

function isMessageComponent(i: Interaction): i is AnyMessageComponentInteraction {
	return i.isMessageComponent();
}

/**
 * Global registry to inspect "what happened" when debugging.
 */
export class InteractionRegistry {
	private static map = new Map<string, TrackedInteraction>();

	static set(ix: TrackedInteraction) {
		this.map.set(ix.id, ix);
	}
	static get(id: string) {
		return this.map.get(id);
	}
	static delete(id: string) {
		this.map.delete(id);
	}
	static dumpRecent(limit = 30) {
		const items = [...this.map.values()]
			.sort((a, b) => b.createdAtMs - a.createdAtMs)
			.slice(0, limit);

		for (const ix of items) {
			console.log(
				`[IxRegistry] id=${ix.id} user=${ix.userId} guild=${ix.guildId ?? "n/a"} ` +
				`deferReply=${ix.deferredReply} replied=${ix.replied} deferUpdate=${ix.deferredUpdate} updated=${ix.updated} ` +
				`tags=[${ix.tags.join(", ")}] ageMs=${Date.now() - ix.createdAtMs}`
			);
			const last = ix.history[ix.history.length - 1];
			if (last) {
				console.log(
					`  last=${last.action} at=${new Date(last.at).toISOString()} tag=${last.tag ?? ""} note=${last.note ?? ""} callsite=${last.callsite ?? ""}`
				);
			}
		}
	}
}

export class TrackedInteraction {
	public readonly interaction: Interaction;
	public readonly id: string;
	public readonly createdAtMs: number;

	public readonly guildId?: string;
	public readonly channelId?: string;
	public readonly userId: string;

	// tracked state
	public deferredReply = false;
	public replied = false;
	public deferredUpdate = false;
	public updated = false;

	public tags: string[] = [];
	public notes: string[] = [];
	public history: HistoryEntry[] = [];

	constructor(interaction: Interaction, tag?: string, note?: string) {
		this.interaction = interaction;
		this.id = interaction.id;
		this.createdAtMs = Date.now();

		this.guildId = interaction.guildId ?? undefined;
		this.channelId = interaction.channelId ?? undefined;
		this.userId = interaction.user?.id ?? "unknown";

		// Seed from discord.js flags when available
		// (Only exists on RepliableInteraction types, but safe via `as any`)
		this.deferredReply = Boolean((interaction as any).deferred);
		this.replied = Boolean((interaction as any).replied);

		if (tag) this.tags.push(tag);
		if (note) this.notes.push(note);

		InteractionRegistry.set(this);
	}

	addTag(tag: string) {
		this.tags.push(tag);
	}
	addNote(note: string) {
		this.notes.push(note);
	}

	private push(action: HistoryAction, tag?: string, note?: string) {
		this.history.push({
			at: Date.now(),
			action,
			tag,
			note,
			callsite: getCallsite(),
		});
	}

	private warn(msg: string, extra?: any) {
		console.warn(
			`[TrackedInteraction WARN ${nowISO()}] ${msg} id=${this.id} user=${this.userId} guild=${this.guildId ?? "n/a"} ` +
			`deferReply=${this.deferredReply} replied=${this.replied} deferUpdate=${this.deferredUpdate} updated=${this.updated} ` +
			`tags=[${this.tags.join(", ")}] notes=[${this.notes.join(" | ")}]`,
			extra ?? ""
		);
	}

	// ---------- Reply flow (slash commands, modals, select menus, etc.) ----------

	async deferReply(opts?: { ephemeral?: boolean; tag?: string; note?: string }) {
		this.push("deferReply", opts?.tag, opts?.note);

		if (!isRepliable(this.interaction)) {
			this.warn("deferReply() called on non-repliable interaction", opts);
			return false;
		}
		if (this.replied) {
			this.warn("deferReply() called after reply()", opts);
			return false;
		}
		if (this.deferredReply) {
			this.warn("deferReply() called twice", opts);
			return false;
		}

		await this.interaction.deferReply(opts?.ephemeral ? { flags:MessageFlags.Ephemeral} : {});
		this.deferredReply = true;
		return true;
	}

	async reply(payload: ReplyPayload, opts?: { tag?: string; note?: string; forceFollowUp?: boolean }): Promise<{ success: boolean, response: InteractionCallbackResponse | Message | null }> {
		if (!isRepliable(this.interaction)) {
			this.push("reply", opts?.tag, opts?.note);
			this.warn("reply() called on non-repliable interaction", { opts });
			return { success: false, response: null };
		}

		if (this.replied) {
			this.push("reply", opts?.tag, opts?.note);
			this.warn("reply() called after already replied", { opts });
			return { success: false, response: null };
		}

		// If deferredReply, first visible response should be editReply (unless forced followUp)
		if (this.deferredReply && !opts?.forceFollowUp) {
			this.push("editReply", opts?.tag, opts?.note);
			const response = await this.interaction.editReply(payload as any);
			this.replied = true;
			return { success: true, response: response };
		}

		this.push("reply", opts?.tag, opts?.note);
		const response = await this.interaction.reply(payload as any);
		this.replied = true;
		return { success: true, response: response };
	}

	async editReply(
		payload: EditPayload,
		opts?: { tag?: string; note?: string }
	): Promise<{ success: boolean; response: Message | InteractionCallbackResponse | null }> {
		this.push("editReply", opts?.tag, opts?.note);

		if (!isRepliable(this.interaction)) {
			this.warn("editReply() called on non-repliable interaction", opts);
			return { success: false, response: null };
		}

		if (!this.deferredReply && !this.replied) {
			this.warn("editReply() called before deferReply/reply", opts);
			return { success: false, response: null };
		}

		try {
			const response = await this.interaction.editReply(payload as any);
			this.replied = true;
			return { success: true, response };
		} catch (err) {
			this.warn("editReply() threw", { err, payload, opts });
			return { success: false, response: null };
		}
	}

	async followUp(
		payload: ReplyPayload,
		opts?: { tag?: string; note?: string }
	): Promise<{ success: boolean; response: InteractionCallbackResponse | Message | null }> {
		this.push("followUp", opts?.tag, opts?.note);

		if (!isRepliable(this.interaction)) {
			this.warn("followUp() called on non-repliable interaction", opts);
			return { success: false, response: null };
		}

		// If nothing yet, followUp will error; fall back to reply
		// Note: allow followUp when a component was deferred via deferUpdate()
		// because deferUpdate() is a valid prior response for message components.
		if (!this.deferredReply && !this.replied && !this.deferredUpdate) {
			this.warn("followUp() called before deferReply/reply; falling back to reply()", opts);
			return this.reply(payload, { tag: opts?.tag, note: opts?.note });
		}

		const response = await this.interaction.followUp(payload as any);
		return { success: true, response: response as Message };
	}


	// ---------- Component update flow (buttons/select menus) ----------

	async deferUpdate(opts?: { tag?: string; note?: string }) {
		this.push("deferUpdate", opts?.tag, opts?.note);

		if (!isMessageComponent(this.interaction)) {
			this.warn("deferUpdate() called on non-message-component interaction", opts);
			return false;
		}

		// Mixing reply/deferReply with update/deferUpdate tends to cause double-response bugs
		if (this.replied || this.deferredReply) {
			this.warn("deferUpdate() called after reply/deferReply (mixed response types)", opts);
			return false;
		}
		if (this.deferredUpdate || this.updated) {
			this.warn("deferUpdate() called twice or after update()", opts);
			return false;
		}

		await this.interaction.deferUpdate();
		this.deferredUpdate = true;
		return true;
	}

	async update(payload: any, opts?: { tag?: string; note?: string }) {
		this.push("update", opts?.tag, opts?.note);

		if (!isMessageComponent(this.interaction)) {
			this.warn("update() called on non-message-component interaction", opts);
			return false;
		}

		if (this.replied || this.deferredReply) {
			this.warn("update() called after reply/deferReply (mixed response types)", opts);
			return false;
		}
		if (this.updated) {
			this.warn("update() called twice", opts);
			return false;
		}

		await this.interaction.update(payload);
		this.updated = true;
		return true;
	}

	// ---------- Modal ----------

	async showModal(modal: ModalBuilder, opts?: { tag?: string; note?: string }) {
		this.push("showModal", opts?.tag, opts?.note);

		if (!("showModal" in this.interaction)) {
			this.warn("showModal() called on interaction without showModal()", opts);
			return false;
		}

		// showModal is also a response; prevent duplicates
		if (this.replied || this.deferredReply || this.deferredUpdate || this.updated) {
			this.warn("showModal() called after a response already happened", opts);
			return false;
		}

		await (this.interaction as any).showModal(modal);
		this.replied = true;
		return true;
	}

	async awaitModalSubmit(
		options: AwaitModalSubmitOptions<ModalSubmitInteraction>,
		opts?: { tag?: string; note?: string }
	): Promise<{ success: boolean; interaction: ModalSubmitInteraction | null }> {
		this.push("awaitModalSubmit", opts?.tag, opts?.note);

		// awaitModalSubmit is only meaningful after you've shown a modal
		// (or at least intend to capture one). We don't strictly enforce,
		// but we log if it looks suspicious.
		if (!("awaitModalSubmit" in (this.interaction as any))) {
			this.warn("awaitModalSubmit() not available on this interaction object (discord.js typings/runtime)", {
				options,
				tag: opts?.tag,
				note: opts?.note,
			});
			return { success: false, interaction: null };
		}

		try {
			const mi = (await (this.interaction as any).awaitModalSubmit(
				options
			)) as ModalSubmitInteraction;

			return { success: true, interaction: mi };
		} catch (err: any) {
			// Most common "error" is just timeout, which throws.
			this.warn("awaitModalSubmit() threw (often timeout)", {
				err: err?.message ?? err,
				options,
				tag: opts?.tag,
				note: opts?.note,
			});
			return { success: false, interaction: null };
		}
	}

	async awaitModalSubmitTracked(
		options: AwaitModalSubmitOptions<ModalSubmitInteraction>,
		opts?: {
			tag?: string;
			note?: string;
			// tags/notes applied to the NEW tracked modal interaction
			modalTag?: string;
			modalNote?: string;
		}
	): Promise<{ success: boolean; tracked: TrackedInteraction | null }> {
		this.push("awaitModalSubmitTracked" as any, opts?.tag, opts?.note);

		const result = await this.awaitModalSubmit(options, {
			tag: opts?.tag ?? "awaitModalSubmitTracked",
			note: opts?.note,
		});

		if (!result.success || !result.interaction) {
			return { success: false, tracked: null };
		}

		// Wrap the modal submit interaction in a new tracker
		const modalIx = new TrackedInteraction(
			result.interaction,
			opts?.modalTag ?? "modalSubmit",
			opts?.modalNote ?? `modal submit for parent=${this.id}`
		);

		// Link back for debugging
		modalIx.addTag(`parent:${this.id}`);
		if (this.tags.length) modalIx.addTag(`parentTags:${this.tags.join(",")}`);
		if (this.notes.length) modalIx.addNote(`parentNotes:${this.notes.join(" | ")}`);

		return { success: true, tracked: modalIx };
	}


	dispose() {
		InteractionRegistry.delete(this.id);
	}
}

export function track(interaction: Interaction, tag?: string, note?: string) {
	return new TrackedInteraction(interaction, tag, note);
}
