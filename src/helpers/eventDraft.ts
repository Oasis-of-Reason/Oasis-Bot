import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuInteraction,
	ButtonInteraction,
	TextInputBuilder,
	TextInputStyle,
	ModalBuilder,
	Message,
	Client,
	Guild,
	GuildMember,
	TextChannel,
	ChannelType,
	AnyThreadChannel,
	MessageFlags,
} from "discord.js";
import * as chrono from "chrono-node";
import { prisma } from "../utils/prisma";
import { publishEvent } from "../helpers/publishEvent";
import { getStandardRolesOrganizer, userHasAllowedRole } from "../helpers/securityHelpers";
import { refreshPublishedCalender } from "./refreshPublishedCalender";
import { validateNumber } from "./generalHelpers";

/* ───────────────────────────── UI helpers ───────────────────────────── */

export const toUnix = (d: Date) => Math.floor(d.getTime() / 1000);

export function buildDraftEmbed(eventData: {
	id?: number;
	hostId: string;
	title: string;
	description?: string | null;
	activity?: string | null;
	type?: string | null;
	subtype?: string | null;
	scope?: string | null;
	platforms?: string[] | null;
	requirements?: string | null;
	capacityCap: number;
	startTime: Date;
	lengthMinutes?: number | null;
	posterUrl?: string | null;
}) {
	const embed = new EmbedBuilder()
		.setTitle("📅 Event Draft")
		.setColor(0x5865f2)
		.setImage(eventData.posterUrl ?? null)
		.addFields(
			{
				name: "Event Information",
				value: `> **Title:** ${eventData.title}\n> **Host:** <@${eventData.hostId}>`,
			},
			{
				name: "Description",
				value: `> ${eventData.description || "—"}`,
			},
			{
				name: "General Information",
				value: `> **Type:** ${eventData.type ?? "—"}\n> **Subtype:** ${eventData.subtype ?? "—"}\n> **Activity:** ${eventData.activity ?? "—"}\n> **Capacity:** ${eventData.capacityCap > 0 ? eventData.capacityCap : "Unlimited"}`,
			}
		);

	if (eventData.type?.toLowerCase() === "vrc") {
		embed.addFields({
			name: "VRC Information",
			value: `> **Platforms:** ${eventData.platforms?.length ? eventData.platforms.join(", ") : "—"}\n> **Avatar Requirements:** ${eventData.requirements ?? "—"}\n> **Instance Type:** ${eventData.scope ?? "—"}`,
		});
	}
	embed.addFields({
		name: "Timing",
		value: `> **Start:** <t:${toUnix(eventData.startTime)}:F> (<t:${toUnix(eventData.startTime)}:R>)\n> **Length:** ${eventData.lengthMinutes ? `${eventData.lengthMinutes} min` : "Not set"}`,
	});

	return embed;
}

export function editButtons() {
	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("edit_title").setLabel("Edit Title").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_description").setLabel("Edit Description").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_activity").setLabel("Edit Activity").setStyle(ButtonStyle.Secondary),
		),
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("edit_type").setLabel("Edit Type").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_subtype").setLabel("Edit Subtype").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_scope").setLabel("Edit Scope").setStyle(ButtonStyle.Secondary),
		),
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("edit_platforms").setLabel("Edit Platforms").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_requirements").setLabel("Edit Requirements").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_capacity").setLabel("Edit Capacity").setStyle(ButtonStyle.Secondary),
		),
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("edit_start").setLabel("Edit Start Time").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_length").setLabel("Edit Length").setStyle(ButtonStyle.Secondary),
		),
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("get_event_id").setLabel("🔑 Get ID").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("publish_event").setLabel("🚀 Publish").setStyle(ButtonStyle.Success),
		),
	];
}

export const mkSelect = (
	id: string,
	placeholder: string,
	options: { label: string; value: string }[],
	min = 1,
	max = 1
) =>
	new StringSelectMenuBuilder()
		.setCustomId(id)
		.setPlaceholder(placeholder)
		.setMinValues(min)
		.setMaxValues(max)
		.addOptions(options);

export const updateDraftByMsgId = (draftThreadMessageId: string, data: Record<string, any>) =>
	prisma.event.update({ where: { draftThreadMessageId }, data });

/* ─────────────────────── button interaction handler ─────────────────────── */

export async function handleDraftButton(
	i: ButtonInteraction,
	eventData: {
		id: number;
		hostId: string;
		title: string;
		description?: string | null;
		activity?: string | null;
		type?: string | null;
		subtype?: string | null;
		scope?: string | null;
		platforms?: string[] | null;
		requirements?: string | null;
		capacityCap: number;
		startTime: Date;
		lengthMinutes?: number | null;
		posterUrl?: string | null;
	},
	message: Message
) {
	const rerender = async () => {
		await message.edit({ embeds: [buildDraftEmbed(eventData)], components: editButtons() });
	};

	const modalInput = async (id: string, title: string, field: string, label: string, paragraph = false) => {
		const modal = new ModalBuilder()
			.setCustomId(id)
			.setTitle(title)
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder()
						.setCustomId(field)
						.setLabel(label)
						.setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
						.setRequired(false)
				)
			);
		await i.showModal(modal);
		const sub = await i.awaitModalSubmit({
			filter: (x) => x.customId === id && x.user.id === i.user.id,
			time: 120_000,
		});
		await sub.deferReply({ flags: MessageFlags.Ephemeral });
		return sub;
	};

	switch (i.customId) {
		case "edit_title": {
			const sub = await modalInput("modal_edit_title", "Edit Title", "new_title", "New Title");
			eventData.title = sub.fields.getTextInputValue("new_title") || eventData.title;
			await updateDraftByMsgId(message.id, { title: eventData.title });
			await sub.editReply({ content: "✅ Title updated!" });
			await rerender();
			break;
		}
		case "edit_description": {
			const sub = await modalInput("modal_edit_description", "Edit Description", "new_description", "New Description", true);
			eventData.description = sub.fields.getTextInputValue("new_description") || null;
			await updateDraftByMsgId(message.id, { description: eventData.description });
			await sub.editReply({ content: "✅ Description updated!" });
			await rerender();
			break;
		}
		case "edit_activity": {
			const sub = await modalInput("modal_edit_activity", "Edit Activity", "new_activity", "Activity");
			eventData.activity = sub.fields.getTextInputValue("new_activity") || null;
			await updateDraftByMsgId(message.id, { activity: eventData.activity });
			await sub.editReply({ content: "✅ Activity updated!" });
			await rerender();
			break;
		}
		case "edit_capacity": {
			const modal = new ModalBuilder()
				.setCustomId("modal_edit_capacity")
				.setTitle("Edit Capacity")
				.addComponents(
					new ActionRowBuilder<TextInputBuilder>().addComponents(
						new TextInputBuilder().setCustomId("new_capacity_cap").setLabel("Max Capacity").setStyle(TextInputStyle.Short).setRequired(true)
					)
				);
			await i.showModal(modal);
			const sub = await i.awaitModalSubmit({
				filter: (x) => x.customId === "modal_edit_capacity" && x.user.id === i.user.id,
				time: 120_000,
			});
			await sub.deferReply({ flags: MessageFlags.Ephemeral });
			let val = validateNumber(sub.fields.getTextInputValue("new_capacity_cap"));
			eventData.capacityCap = val;
			await updateDraftByMsgId(message.id, { capacityCap: val });
			await sub.editReply({ content: "✅ Capacity updated!" });
			await rerender();
			break;
		}
		case "edit_start": {
			const sub = await modalInput("modal_edit_start", "Edit Start Time", "new_start", "When does it start?");
			const parsed = chrono.parseDate(sub.fields.getTextInputValue("new_start"));
			if (parsed) {
				eventData.startTime = parsed;
				await updateDraftByMsgId(message.id, { startTime: eventData.startTime });
				await sub.editReply({ content: "✅ Start time updated!" });
			} else {
				await sub.editReply({ content: "❌ Could not parse that date/time." });
			}
			await rerender();
			break;
		}
		case "edit_length": {
			const sub = await modalInput("modal_edit_length", "Edit Length", "new_length", "Length in minutes");
			let val = validateNumber(sub.fields.getTextInputValue("new_length"));
			eventData.lengthMinutes = val;
			await updateDraftByMsgId(message.id, { lengthMinutes: val });
			await sub.editReply({ content: "✅ Length updated!" });
			await rerender();
			break;
		}
		case "edit_type": {
			const msg = await i.reply({
				content: "Select a new type:",
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect("select_type", "Choose type", [
							{ label: "VRC", value: "VRC" },
							{ label: "Discord", value: "Discord" },
						])
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			});

			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: 120_000,
				filter: (x) => x.user.id === i.user.id && x.customId === "select_type",
			});
			col.on("collect", async (s: StringSelectMenuInteraction) => {
				eventData.type = s.values[0];
				await updateDraftByMsgId(message.id, { type: eventData.type });
				await s.update({ content: "✅ Updated!", components: [] });
				await rerender();
			});
			break;
		}
		case "edit_subtype": {
			const msg = await i.reply({
				content: "Select a new subtype:",
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect("select_subtype", "Choose subtype", [
							{ label: "Gaming", value: "Gaming" },
							{ label: "Social", value: "Social" },
							{ label: "Cinema", value: "Cinema" },
						])
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			});

			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: 120_000,
				filter: (x) => x.user.id === i.user.id && x.customId === "select_subtype",
			});
			col.on("collect", async (s: StringSelectMenuInteraction) => {
				eventData.subtype = s.values[0];
				await updateDraftByMsgId(message.id, { subtype: eventData.subtype });
				await s.update({ content: "✅ Updated!", components: [] });
				await rerender();
			});
			break;
		}
		case "edit_scope": {
			const msg = await i.reply({
				content: "Select a new instance type:",
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect("select_scope", "Choose scope", [
							{ label: "Group Only", value: "Group" },
							{ label: "Friends Can Join", value: "Friends" },
						])
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			});

			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: 120_000,
				filter: (x) => x.user.id === i.user.id && x.customId === "select_scope",
			});
			col.on("collect", async (s: StringSelectMenuInteraction) => {
				eventData.scope = s.values[0];
				await updateDraftByMsgId(message.id, { scope: eventData.scope });
				await s.update({ content: "✅ Updated!", components: [] });
				await rerender();
			});
			break;
		}
		case "edit_platforms": {
			const msg = await i.reply({
				content: "Select new platforms:",
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect(
							"select_platforms",
							"Choose platform(s)",
							[
								{ label: "PCVR", value: "PCVR" },
								{ label: "Android", value: "Android" },
							],
							1,
							2
						)
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			});

			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: 120_000,
				filter: (x) => x.user.id === i.user.id && x.customId === "select_platforms",
			});
			col.on("collect", async (s: StringSelectMenuInteraction) => {
				eventData.platforms = s.values;
				await updateDraftByMsgId(message.id, { platforms: JSON.stringify(eventData.platforms) });
				await s.update({ content: "✅ Updated!", components: [] });
				await rerender();
			});
			break;
		}
		case "edit_requirements": {
			const msg = await i.reply({
				content: "Select new avatar performance requirement:",
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect("select_requirements", "Avatar performance", [
							{ label: "No Restriction", value: "No Restriction" },
							{ label: "Poor or better", value: "Poor or better" },
							{ label: "Medium or better", value: "Medium or better" },
							{ label: "Good or better", value: "Good or better" },
							{ label: "Excellent", value: "Excellent" },
						])
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			});

			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: 120_000,
				filter: (x) => x.user.id === i.user.id && x.customId === "select_requirements",
			});
			col.on("collect", async (s: StringSelectMenuInteraction) => {
				eventData.requirements = s.values[0];
				await updateDraftByMsgId(message.id, { requirements: eventData.requirements });
				await s.update({ content: "✅ Updated!", components: [] });
				await rerender();
			});
			break;
		}
		case "get_event_id":
			await i.reply({ content: `This event's ID is \`${eventData.id}\``, flags: MessageFlags.Ephemeral });
			break;

		case "publish_event": {
			const guild = i.guild as Guild;
			if (!userHasAllowedRole(i.member as GuildMember, getStandardRolesOrganizer())) {
				await i.reply({ content: "❌ Only organizers can publish.", flags: MessageFlags.Ephemeral });
				return;
			}
			try {
				await publishEvent(i.client, guild, eventData.id);
				await i.reply({ content: "✅ Event published!", flags: MessageFlags.Ephemeral });
				await refreshPublishedCalender(i.client, guild.id, true);
			} catch (err) {
				console.error("Publish error:", err);
				await i.reply({ content: "⚠️ Something went wrong while publishing.", flags: MessageFlags.Ephemeral });
			}
			break;
		}

		default:
			await i.deferUpdate(); // safe ack
	}
}

/* ─────────────── Re-attach collectors after a restart ─────────────── */

function isAnyThread(c: any): c is AnyThreadChannel {
	return c?.type === ChannelType.PublicThread || c?.type === ChannelType.PrivateThread || c?.isThread?.();
}

export async function registerEventDraftCollectors(client: Client) {
	console.log("🔁 Restoring event draft collectors…");

	// pull all unpublished drafts
	const now = new Date();
	const nowMinusDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const drafts = await prisma.event.findMany({
		where: { startTime: { gte: nowMinusDay }, },
		select: {
			id: true,
			guildId: true,
			draftThreadId: true,
			draftThreadMessageId: true,
		},
	});

	for (const draft of drafts) {
		try {
			const guild = await client.guilds.fetch(draft.guildId);
			const ch = await guild.channels.fetch(draft.draftThreadId).catch(() => null);
			if (!ch || !isAnyThread(ch)) {
				console.warn(`⚠️ Draft ${draft.id}: channel ${draft.draftThreadId} not a thread or not found`);
				continue;
			}

			// If the thread is archived, temporarily unarchive so we can fetch messages
			const thread = ch as AnyThreadChannel;
			let reArchive = false;
			if (thread.archived) {
				// Requires bot permission to manage threads in that channel
				await thread.setArchived(false, "Restore draft collector");
				reArchive = true;
			}

			// fetch the draft message in the thread
			const msg: Message | null = await thread.messages
				.fetch(draft.draftThreadMessageId)
				.catch(() => null);

			if (!msg) {
				console.warn(`⚠️ Draft ${draft.id}: draft message ${draft.draftThreadMessageId} not found`);
				if (reArchive) await thread.setArchived(true, "Restore draft collector (re-archive)");
				continue;
			}

			// fetch latest event to hydrate UI (platforms may be a JSON string)
			const ev = await prisma.event.findUnique({ where: { id: draft.id } });
			if (!ev) {
				if (reArchive) await thread.setArchived(true, "Restore draft collector (re-archive)");
				continue;
			}

			const eventData = {
				id: ev.id,
				hostId: ev.hostId,
				title: ev.title,
				description: ev.description,
				activity: (ev as any).activity ?? null,
				type: ev.type,
				subtype: ev.subtype,
				scope: ev.scope,
				platforms: typeof ev.platforms === "string" ? JSON.parse(ev.platforms) : (ev.platforms as any),
				requirements: ev.requirements,
				capacityCap: ev.capacityCap,
				startTime: ev.startTime,
				lengthMinutes: ev.lengthMinutes,
				posterUrl: ev.imageUrl ?? null,
			};

			// (Optional) ensure message still has components/embed; reapply if needed
			// This guards against manual edits or stale state.
			try {
				if (!msg.components?.length || !msg.embeds?.length) {
					await msg.edit({ embeds: [buildDraftEmbed(eventData)], components: editButtons() });
				}
			} catch { }

			// attach collector that runs until the message is deleted
			const collector = msg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 0, // infinite
			});

			collector.on("collect", async (i) => handleDraftButton(i, eventData, msg));

			// Re-archive the thread if we opened it
			if (reArchive) {
				try { await thread.setArchived(true, "Restore draft collector (re-archive)"); } catch { }
			}

			console.log(`✅ Restored draft buttons for event ${ev.id}`);
		} catch (err) {
			console.error(`❌ Failed to restore draft ${draft.id}:`, err);
		}
	}
}