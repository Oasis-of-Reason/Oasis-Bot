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
	ChannelType,
	AnyThreadChannel,
	MessageFlags,
	ModalSubmitInteraction,
	TextChannel,
	ThreadChannel,
} from "discord.js";

import {
	validateNumber,
	getPlatformsArray,
	getRequirementsString,
	toUnix,
	setLastTitleChangeTime,
	hasTitleChangeCooldownPassed,
	hasVrcUpdateCooldownPassed,
	setLastVrcUpdateTime,
} from "./generalHelpers";

import {
	getStandardRolesHost,
	getStandardRolesOrganizer,
	userHasAllowedRole,
	userHasAllowedRoleOrId
} from "../helpers/securityHelpers";

import * as chrono from "chrono-node";
import { prisma } from "../utils/prisma";
import { publishEvent, addHostToEventThread } from "../helpers/publishEvent";
import { refreshPublishedCalender } from "./refreshPublishedCalender";
import { writeLog } from "./logger";
import { fetchMsgInThread, getVrcGroupId } from "./discordHelpers";
import { checkEventPublishedOrDraftOnly } from "./getEventButtons";
import { updateThreadTitle } from "./refreshEventMessages";
import { createOrUpdateGroupEvent, isVrcCookieValid, parseAndMapArray, platformMap, subtypeImageMap, subtypeMap, VrcEventDescription } from "./vrcHelpers";
import { track, TrackedInteraction } from "../utils/interactionSystem";

const TIMEOUT_EXTRA_LONG = 600_000;
const TIMEOUT_LONG = 120_000;
const TIMEOUT_SHORT = 30_000;

let publishInProgress = false;

export interface EventData {
	id: number;
	hostId: string;
	title: string;
	description: string;
	activity: string;
	type: string;
	subtype: string;
	scope: string;
	platforms: string;
	requirements: string;
	capacityCap: number;
	startTime: Date;
	lengthMinutes: number;
	imageUrl: string;
	vrcCalenderEventId: string;
	vrcSendNotification: boolean;
	vrcDescription: string;
	vrcImageId: string;
	vrcGroupId: string;
}

/* ─────────────── Helper Functions ─────────────── */

export const buildDraftEmbed = (event: EventData) => {
	const embed = new EmbedBuilder()
		.setTitle("📅 Event Draft")
		.setColor(0x5865f2)
		.setImage(event.imageUrl || null)
		.setDescription(event.description?.slice(0, 4096) || "No description")
		.addFields(
			{
				name: "Event Information",
				value: `> **Title:** ${event.title}\n> **Host:** <@${event.hostId}>`,
			},
			{
				name: "General Information",
				value: `> **Id:** ${event.id}\n> **Type:** ${event.type || "—"}\n> **Subtype:** ${event.subtype || "—"}\n> **Activity:** ${event.activity || "—"}\n> **Capacity:** ${event.capacityCap > 0 ? event.capacityCap : "Unlimited"}`,
			},
			{
				name: "Timing",
				value: `> **Start:** <t:${toUnix(event.startTime)}:F> (<t:${toUnix(event.startTime)}:R>)\n> **Length:** ${event.lengthMinutes ? `${event.lengthMinutes} min` : "Not set"}`,
			}
		);

	if (event.type?.toLowerCase() === "vrchat") {
		const platforms = event.platforms?.length ? getPlatformsArray(JSON.parse(event.platforms)) : "—";
		embed.addFields({
			name: "VRC Information",
			value: `> **Platforms:** ${platforms}\n> **Avatar Requirements:** ${event.requirements ? getRequirementsString(event.requirements) : "—"}\n> **Instance Type:** ${event.scope || "—"}`,
		});
		if (event.vrcCalenderEventId) {
			const link = `[${event.vrcCalenderEventId}](https://vrchat.com/home/group/${event.vrcGroupId}/calendar/${event.vrcCalenderEventId})`;
			embed.addFields({ name: "VRC Calendar Info", value: `> **Calendar Link:** ${link}` });
		}
		if (event.vrcDescription) {
			embed.addFields({ name: "VRC Calendar Description", value: event.vrcDescription });
		}
	}

	return embed;
};

export function editButtons(id?: string, published?: boolean) {
	return [
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("edit_title").setLabel("Edit Title").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_description").setLabel("Edit Description").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_activity").setLabel("Edit Activity").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_type").setLabel("Edit Type").setStyle(ButtonStyle.Secondary),
		),
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("edit_subtype").setLabel("Edit Subtype").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_scope").setLabel("Edit Scope").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_platforms").setLabel("Edit Platforms").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_requirements").setLabel("Edit Requirements").setStyle(ButtonStyle.Secondary),
		),
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("edit_start").setLabel("Edit Start Time").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_length").setLabel("Edit Length").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_capacity").setLabel("Edit Capacity").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_poster").setLabel("Edit Poster").setStyle(ButtonStyle.Secondary),
		),
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("edit_vrc_description").setLabel("Edit VRC Description").setStyle(ButtonStyle.Secondary),
			//new ButtonBuilder().setCustomId("edit_vrc_imageId").setLabel("Edit VRC Image").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId("edit_vrc_notify").setLabel("(Admin) Edit Notify").setStyle(ButtonStyle.Secondary),
		),
		published ?
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId("publish_event").setLabel("🔧 Update Published Event").setStyle(ButtonStyle.Success),
				new ButtonBuilder().setCustomId("vrc_publish_event").setLabel("(Re)publish to VRChat").setStyle(ButtonStyle.Success),
			) :
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId("publish_event").setLabel("🚀 Publish Event").setStyle(ButtonStyle.Success),
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

export const showModal = async (
	ix: TrackedInteraction,
	id: string,
	title: string,
	field: string,
	label: string,
	defaultValue = "",
	maxLength = 100
): Promise<TrackedInteraction | null> => {
	const modal = new ModalBuilder()
		.setCustomId(id)
		.setTitle(title)
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId(field)
					.setLabel(label)
					.setStyle(maxLength > 100 ? TextInputStyle.Paragraph : TextInputStyle.Short)
					.setRequired(false)
					.setMaxLength(maxLength)
					.setValue(defaultValue)
			)
		);
	await ix.showModal(modal);
	try {
		const sub = await ix.awaitModalSubmitTracked({
			filter: (x) => x.customId === id && x.user.id === ix.interaction.user.id,
			time: maxLength > 100 ? TIMEOUT_EXTRA_LONG : TIMEOUT_LONG
		});
		await sub.tracked?.deferReply({ ephemeral: true });
		return sub.tracked;
	} catch {
		writeLog("Modal submit timed out or errored.");
		return null;
	}
};
export async function handleDraftButton(
	ix: TrackedInteraction,
	event: EventData,
	message: Message
) {
	const interaction = ix.interaction as ButtonInteraction;
	const member = interaction.member as GuildMember;

	const rerender = async () => {
		const published = await checkEventPublishedOrDraftOnly(message.id);
		await message.edit({
			embeds: [buildDraftEmbed(event)],
			components: editButtons(message.id, published)
		});
	};

	/* ───────────── Generic Select Handler ───────────── */

	const handleSelectMenu = async (
		customId: string,
		content: string,
		options: { label: string; value: string }[],
		onSelect: (values: string[]) => Promise<void>,
		min = 1,
		max = 1
	) => {
		await ix.reply({
			content,
			components: [
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					mkSelect(customId, "Select an option", options, min, max)
				)
			],
			flags: MessageFlags.Ephemeral
		});

		try {
			const select = await interaction.channel!.awaitMessageComponent({
				componentType: ComponentType.StringSelect,
				time: TIMEOUT_LONG,
				filter: (i) =>
					i.user.id === interaction.user.id &&
					i.customId === customId
			}) as StringSelectMenuInteraction;

			await onSelect(select.values);

			await select.update({
				content: "✅ Updated!",
				components: []
			});

			await rerender();

		} catch {
			// timeout — safely ignore
		}
	};

	/* ───────────── Generic Modal Handler ───────────── */
	const handleSimpleModalUpdate = async (
		modalId: string,
		title: string,
		field: string,
		label: string,
		currentValue: string,
		onSave: (value: string) => Promise<void>,
		maxLength = 100
	) => {
		const sub = await showModal(
			ix,
			modalId,
			title,
			field,
			label,
			currentValue,
			maxLength
		);
		if (!sub) return;

		const modal = sub.interaction as ModalSubmitInteraction;
		const value = modal.fields.getTextInputValue(field) || "";

		await onSave(value);
		await sub.editReply({ content: "✅ Updated!" });
		await rerender();
	};

	/* ───────────── Switch Logic ───────────── */
	switch (interaction.customId) {

		/* ───────────── Title ───────────── */
		case "edit_title":
			if (!(await hasTitleChangeCooldownPassed(event.id))) {
				return ix.reply({
					content: "5 min cooldown for title change has not passed.",
					flags: MessageFlags.Ephemeral
				});
			}

			await handleSimpleModalUpdate(
				"modal_edit_title",
				"Edit Title",
				"new_title",
				"New Title",
				event.title,
				async (val) => {
					event.title = val || event.title;
					await setLastTitleChangeTime(event.id);
					await updateDraftByMsgId(message.id, { title: event.title });
					await updateThreadTitle(
						interaction.client,
						interaction.channelId,
						event.title,
						event.id
					);
				}
			);
			break;

		/* ───────────── Description / Activity ───────────── */
		case "edit_description":
			await handleSimpleModalUpdate(
				"modal_edit_description",
				"Edit Description",
				"new_description",
				"New Description",
				event.description,
				async (val) => {
					event.description = val;
					await updateDraftByMsgId(message.id, { description: val });
				},
				4000
			);
			break;

		case "edit_activity":
			await handleSimpleModalUpdate(
				"modal_edit_activity",
				"Edit Activity",
				"new_activity",
				"Activity",
				event.activity,
				async (val) => {
					event.activity = val;
					await updateDraftByMsgId(message.id, { activity: val });
				}
			);
			break;

		/* ───────────── Numeric Updates ───────────── */
		case "edit_capacity":
			await handleSimpleModalUpdate(
				"modal_edit_capacity",
				"Edit Capacity",
				"new_capacity_cap",
				"Max Capacity",
				"", // no default value
				async (val) => {
					event.capacityCap = validateNumber(val);
					await updateDraftByMsgId(message.id, { capacityCap: event.capacityCap });
					writeLog(`Updated capacity for event ${event.id} to ${event.capacityCap}`);
				}
			);
			break;

		case "edit_length":
			await handleSimpleModalUpdate(
				"modal_edit_length",
				"Edit Length",
				"new_length",
				"Length in minutes",
				"", // no default value
				async (val) => {
					event.lengthMinutes = validateNumber(val);
					await updateDraftByMsgId(message.id, { lengthMinutes: event.lengthMinutes });
					writeLog(`Updated length for event ${event.id} to ${event.lengthMinutes} min`);
				}
			);
			break;

		case "edit_start":
			await handleSimpleModalUpdate(
				"modal_edit_start",
				"Edit Start Time",
				"new_start",
				"When does it start?",
				"",
				async (val) => {
					const parsed = chrono.parseDate(val);
					if (!parsed) throw new Error("Invalid date");
					event.startTime = parsed;
					await updateDraftByMsgId(message.id, {
						startTime: parsed
					});
				}
			);
			break;

		/* ───────────── Poster Upload ───────────── */
		case "edit_poster": {
			writeLog(`Starting poster update for event ${event.id}`);
			await ix.reply({ content: "Please upload a new poster image in this thread within 30 seconds.", flags: MessageFlags.Ephemeral });
			const channel = interaction.channel as TextChannel | ThreadChannel;
			const collected = await channel.awaitMessages({
				filter: (m) => m.author.id === interaction.user.id && m.attachments.size > 0,
				max: 1,
				time: TIMEOUT_SHORT,
			});

			if (collected.size === 0) return;
			const attachment = collected.first()!.attachments.first();
			if (!attachment?.contentType?.startsWith("image/")) return;

			const posterUrl = attachment.url;
			event.imageUrl = posterUrl;
			await prisma.event.update({ where: { id: event.id }, data: { imageUrl: posterUrl } });
			writeLog(`Poster updated for event ${event.id}: ${posterUrl}`);

			const published = await checkEventPublishedOrDraftOnly(message.id);
			await message.edit({ embeds: [buildDraftEmbed(event)], components: editButtons(message.id, published) });
			await ix.followUp({ content: "✅ Poster updated!", flags: MessageFlags.Ephemeral });
			break;
		}

		/* ───────────── VRChat Updates ───────────── */
		case "edit_vrc_description":
			await handleSimpleModalUpdate(
				"modal_edit_vrc_description",
				"Edit VRC Description",
				"new_vrc_description",
				"New VRC Description",
				event.vrcDescription || "",
				async (val) => {
					event.vrcDescription = val;
					await updateDraftByMsgId(message.id, { vrcDescription: val });
					writeLog(`VRC description updated for event ${event.id}`);
				},
				1000
			);
			break;

		case "edit_vrc_notify":
			if (!userHasAllowedRole(member, getStandardRolesOrganizer())) {
				return ix.reply({ content: "Ask an Admin/Mod/Organizer to do this.", flags: MessageFlags.Ephemeral });
			}
			await handleSelectMenu(
				"select_vrc_notify",
				"Select whether to notify the VRChat group on creation:",
				[
					{ label: "True", value: "True" },
					{ label: "False", value: "False" }
				],
				async ([val]) => {
					event.vrcSendNotification = val === "True";
					await updateDraftByMsgId(message.id, { vrcSendNotification: event.vrcSendNotification });
					writeLog(`VRC notify updated for event ${event.id}: ${event.vrcSendNotification}`);
				},
				1,
				1
			);
			break;

		case "vrc_publish_event":
			writeLog(`Starting VRChat publish for event ${event.id}`);
			if (!(await hasVrcUpdateCooldownPassed(event.id))) {
				return ix.reply({ content: "5 min cooldown for VRC update has not passed.", flags: MessageFlags.Ephemeral });
			}
			await ix.deferUpdate();
			await setLastVrcUpdateTime(event.id);

			const guild = interaction.guild!;
			const guildConfig = await prisma.guildConfig.findUnique({
				where: { id: guild.id },
				select: { vrcLoginToken: true }
			});
			const groupId = await getVrcGroupId(guild.id);
			if (!groupId || !guildConfig?.vrcLoginToken) {
				return ix.followUp("❌ VRChat setup missing. Tell an admin.");
			}

			const valid = await isVrcCookieValid(guildConfig.vrcLoginToken);
			if (!valid) return ix.followUp("❌ VRChat session invalid. Tell an admin.");

			const eventDesc = new VrcEventDescription(
				event.title,
				event.vrcDescription || event.description || "",
				subtypeMap[event.subtype.toLowerCase()],
				event.startTime.toISOString(),
				event.lengthMinutes || 60,
				event.vrcImageId || subtypeImageMap[event.subtype.toLowerCase()],
				parseAndMapArray(event.platforms, platformMap),
				event.vrcSendNotification || false,
				15, 10
			);

			const createdOrUpdated = await createOrUpdateGroupEvent(
				guildConfig.vrcLoginToken,
				groupId,
				eventDesc,
				event.vrcCalenderEventId || undefined
			);
			event.vrcCalenderEventId = createdOrUpdated?.id;
			event.vrcGroupId = groupId;

			await prisma.event.update({
				where: { id: event.id },
				data: { vrcCalenderEventId: createdOrUpdated?.id, vrcGroupId: groupId }
			});
			writeLog(`VRChat event published: ${event.id}, eventId=${event.vrcCalenderEventId}`);

			await rerender();
			await ix.followUp({ content: "✅ Event (re)published to VRChat!", flags: MessageFlags.Ephemeral });
			break;
			
		/* ───────────── Select-Based Updates ───────────── */
		case "edit_type":
			await handleSelectMenu(
				"select_type",
				"Select a new type:",
				[
					{ label: "VRC", value: "VRCHAT" },
					{ label: "Discord", value: "DISCORD" }
				],
				async ([val]) => {
					event.type = val;
					await updateDraftByMsgId(message.id, { type: val });
				}
			);
			break;

		case "edit_subtype":
			await handleSelectMenu(
				"select_subtype",
				"Select a new subtype:",
				[
					{ label: "Gaming", value: "GAMING" },
					{ label: "Social", value: "SOCIAL" },
					{ label: "Cinema", value: "CINEMA" },
					{ label: "Art", value: "ART" },
					{ label: "Wellness", value: "WELLNESS" }
				],
				async ([val]) => {
					event.subtype = val;
					await updateDraftByMsgId(message.id, { subtype: val });
				}
			);
			break;

		case "edit_scope":
			await handleSelectMenu(
				"select_scope",
				"Select instance type:",
				[
					{ label: "Group Members Only", value: "Group" },
					{ label: "Friends Can Join : Group+", value: "Group+" }
				],
				async ([val]) => {
					event.scope = val;
					await updateDraftByMsgId(message.id, { scope: val });
				}
			);
			break;

		case "edit_platforms":
			await handleSelectMenu(
				"select_platforms",
				"Select platforms:",
				[
					{ label: "PCVR", value: "PCVR" },
					{ label: "Android", value: "Android" }
				],
				async (vals) => {
					event.platforms = JSON.stringify(vals);
					await updateDraftByMsgId(message.id, {
						platforms: event.platforms
					});
				},
				1,
				2
			);
			break;

		case "edit_requirements":
			await handleSelectMenu(
				"select_requirements",
				"Select avatar performance requirement:",
				[
					{ label: "No Restriction", value: "verypoor" },
					{ label: "Poor or better", value: "poor" },
					{ label: "Medium or better", value: "medium" },
					{ label: "Good or better", value: "good" },
					{ label: "Excellent", value: "excellent" }
				],
				async ([val]) => {
					event.requirements = val;
					await updateDraftByMsgId(message.id, {
						requirements: val
					});
				}
			);
			break;

		/* ───────────── Publish ───────────── */
		case "publish_event":
			if (publishInProgress) {
				return ix.reply({
					content: "A publish is already in progress.",
					flags: MessageFlags.Ephemeral
				});
			}

			publishInProgress = true;
			try {
				await ix.deferReply();

				if (
					!userHasAllowedRoleOrId(
						member,
						getStandardRolesOrganizer(),
						[event.hostId]
					)
				) {
					return ix.followUp({
						content: "❌ Only organisers can publish.",
						flags: MessageFlags.Ephemeral
					});
				}

				const guild = interaction.guild!;
				await publishEvent(interaction.client, guild, event.id);
				await addHostToEventThread(guild, event.id);
				await refreshPublishedCalender(
					interaction.client,
					guild.id,
					true
				);

				await rerender();

				await ix.followUp({
					content: "✅ Event published!",
					flags: MessageFlags.Ephemeral
				});
			} catch (err) {
				console.error(err);
				await ix.followUp({
					content: "⚠️ Publish failed.",
					flags: MessageFlags.Ephemeral
				});
			} finally {
				publishInProgress = false;
			}
			break;

		default:
			await ix.deferUpdate();
	}
}

/* ─────────────── Re-attach collectors after a restart ─────────────── */
function isAnyThread(c: any): c is AnyThreadChannel {
	return c?.type === ChannelType.PublicThread || c?.type === ChannelType.PrivateThread || c?.isThread?.();
}

export async function registerAllEventDraftCollectors(client: Client) {
	console.log("🔁 Restoring event draft collectors…");

	// pull all unpublished drafts
	const now = new Date();
	const nowMinusDay = new Date(now.getTime() - 168 * 60 * 60 * 1000); // added 7 days buffer for old drafts
	const drafts = await prisma.event.findMany({
		where: {
			OR: [
				{ startTime: { gte: nowMinusDay } },
				{ createdAt: { gte: nowMinusDay } },
			],
		},
		select: {
			id: true,
			guildId: true,
			draftThreadId: true,
			draftThreadMessageId: true,
		},
	});
	writeLog(`Restoring ${drafts.length} event draft collectors`)
	for (const draft of drafts) {
		try {
			const guild = await client.guilds.cache.get(draft.guildId) ?? await client.guilds.fetch(draft.guildId);
			await restoreEventDraftCollectors(guild, draft);
		} catch (err) {
			console.error(`❌ Failed to restore draft ${draft.id}:`, err);
			writeLog(`Failed to restore draft ${draft.id}: ${err}`);
		}
	}
}

export async function restoreEventDraftCollectors(guild: Guild, draft: any) {
	const ch = await guild.channels.cache.get(draft.draftThreadId) ?? await guild.channels.fetch(draft.draftThreadId).catch(() => null);
	if (!ch || !isAnyThread(ch)) {
		console.warn(`⚠️ Draft ${draft.id}: channel ${draft.draftThreadId} not a thread or not found`);
		return;
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
	let msg;
	try {
		msg = await thread.messages.fetch(draft.draftThreadMessageId);
	} catch {
		console.warn(`⚠️ Draft ${draft.id}: draft message not found`);
		if (reArchive) await thread.setArchived(true);
		return;
	}

	if (!msg) {
		console.warn(`⚠️ Draft ${draft.id}: draft message ${draft.draftThreadMessageId} not found`);
		if (reArchive) await thread.setArchived(true, "Restore draft collector (re-archive)");
		return;
	}

	// fetch latest event to hydrate UI (platforms may be a JSON string)
	const ev = await prisma.event.findUnique({ where: { id: draft.id } });
	if (!ev) {
		if (reArchive) await thread.setArchived(true, "Restore draft collector (re-archive)");
		return;
	}

	const eventData = {
		id: ev.id,
		hostId: ev.hostId,
		title: ev.title,
		description: ev.description ?? "",
		activity: (ev as any).activity ?? null,
		type: ev.type,
		subtype: ev.subtype,
		scope: ev.scope ?? "",
		platforms: ev.platforms ?? "",
		requirements: ev.requirements ?? "",
		capacityCap: ev.capacityCap ?? 0,
		startTime: ev.startTime,
		lengthMinutes: ev.lengthMinutes ?? 0,
		imageUrl: ev.imageUrl ?? "",
		vrcCalenderEventId: ev.vrcCalenderEventId ?? "",
		vrcSendNotification: ev.vrcSendNotification ?? false,
		vrcDescription: ev.vrcDescription ?? "",
		vrcImageId: ev.vrcImageId ?? "",
		vrcGroupId: ev.vrcGroupId ?? "",
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

	collector.on("collect", async (i) => handleDraftButton(track(i, "From Restore", eventData.id + " " + eventData.title + " By: " + eventData.hostId), eventData, msg));

	// Re-archive the thread if we opened it
	if (reArchive) {
		try { await thread.setArchived(true, "Restore draft collector (re-archive)"); } catch { }
	}

	console.log(`✅ Restored draft buttons for event ${ev.id}`);
	writeLog(`Restored draft buttons for event ${ev.id}`);
}