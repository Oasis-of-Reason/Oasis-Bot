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
	setLastVrcUpdateTime
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
import { createOrUpdateGroupEvent, isVrcCookieValid, mapArray, parseAndMapArray, platformMap, subtypeImageMap, subtypeMap, VrcEventDescription } from "./vrcHelpers";

const TIMEOUT_TIME_LONG = 120_000;
const TIMEOUT_TIME_SHORT = 30_000;

export function buildDraftEmbed(eventData: {
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
}) {
	const embed = new EmbedBuilder()
		.setTitle("📅 Event Draft")
		.setColor(0x5865f2)
		.setImage(eventData.imageUrl ?? null)
		.setDescription(eventData.description?.slice(0, 4096) || 'No description')
		.addFields(
			{
				name: "Event Information",
				value: `> **Title:** ${eventData.title}\n> **Host:** <@${eventData.hostId}>`,
			},
			{
				name: "General Information",
				value: `> **Id:** ${eventData.id}\n> **Type:** ${eventData.type ?? "—"}\n> **Subtype:** ${eventData.subtype ?? "—"}\n> **Activity:** ${eventData.activity ?? "—"}\n> **Capacity:** ${eventData.capacityCap > 0 ? eventData.capacityCap : "Unlimited"}`,
			}
		);
	embed.addFields({
		name: "Timing",
		value: `> **Start:** <t:${toUnix(eventData.startTime)}:F> (<t:${toUnix(eventData.startTime)}:R>)\n> **Length:** ${eventData.lengthMinutes ? `${eventData.lengthMinutes} min` : "Not set"}`,
	});

	if (eventData.type?.toLowerCase() === "vrc") {
		const parsedPlatforms = JSON.parse(eventData.platforms);
		embed.addFields({
			name: "VRC Information",
			value: `> **Platforms:** ${eventData.platforms?.length ? getPlatformsArray(parsedPlatforms) : "—"}\n> **Avatar Requirements:** ${eventData.requirements ? getRequirementsString(eventData.requirements) : "—"}\n> **Instance Type:** ${eventData.scope ?? "—"}`,
		});
		if (eventData.vrcCalenderEventId) {
			const link = `[${eventData.vrcCalenderEventId}](https://vrchat.com/home/group/${eventData.vrcGroupId}/calendar/${eventData.vrcCalenderEventId})`
			embed.addFields({
				name: "VRC Calender Info",
				value: `> **Calender Link:** ${link}\n`,
			});
		}
		if (eventData.vrcDescription) {
			embed.addFields({
				name: "VRC Calender Description",
				value: eventData.vrcDescription,
			});
		}
	}

	return embed;
}

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

/* ─────────────────────── button interaction handler ─────────────────────── */

export async function handleDraftButton(
	i: ButtonInteraction,
	eventData: {
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
	},
	message: Message
) {
	const rerender = async () => {
		const pubCheck = await checkEventPublishedOrDraftOnly(message.id);
		await message.edit({ embeds: [buildDraftEmbed(eventData)], components: editButtons(message.id, pubCheck) });
	};

	const modalInput = async (id: string, title: string, field: string, label: string, defaultValue: string = "", size = 100): Promise<ModalSubmitInteraction | null> => {
		const modal = new ModalBuilder()
			.setCustomId(id)
			.setTitle(title)
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder()
						.setCustomId(field)
						.setLabel(label)
						.setStyle(size > 100 ? TextInputStyle.Paragraph : TextInputStyle.Short)
						.setRequired(false)
						.setMaxLength(size)
						.setValue(defaultValue)
				)
			);
		await i.showModal(modal);

		try {
			const sub = await i.awaitModalSubmit({
				filter: (x) => x.customId === id && x.user.id === i.user.id,
				time: TIMEOUT_TIME_LONG,
			});
			await sub.deferReply({ flags: MessageFlags.Ephemeral });
			return sub;
		} catch (e) { writeLog("Modal submit timed out or errored."); return null; }
	};

	const memberUsername = i.member?.user.username ?? "";
	console.log("Run: " + i.customId + " By: " + memberUsername + " at: " + new Date().toISOString());

	switch (i.customId) {
		case "edit_title": {
			if (!await hasTitleChangeCooldownPassed(eventData.id)) {
				await i.reply({ content: "5 min cooldown for title change has not passed.", flags: MessageFlags.Ephemeral })
				break;
			}
			const sub = await modalInput("modal_edit_title", "Edit Title", "new_title", "New Title", eventData.title ?? "");
			if (!sub) return;
			eventData.title = sub.fields.getTextInputValue("new_title") || eventData.title;
			await sub.editReply({ content: "✅ Title updated! (5 min cooldown)" });
			await setLastTitleChangeTime(eventData.id);
			await updateDraftByMsgId(message.id, { title: eventData.title });
			await updateThreadTitle(i.client, i.channelId, eventData.title, eventData.id);
			await rerender();
			break;
		}
		case "edit_description": {
			const sub = await modalInput("modal_edit_description", "Edit Description", "new_description", "New Description", eventData.description ?? "", 4000);
			if (!sub) return;
			eventData.description = sub.fields.getTextInputValue("new_description") || "";
			await updateDraftByMsgId(message.id, { description: eventData.description });
			await sub.editReply({ content: "✅ Description updated!" });
			await rerender();
			break;
		}
		case "edit_activity": {
			const sub = await modalInput("modal_edit_activity", "Edit Activity", "new_activity", "Activity", eventData.activity ?? "");
			if (!sub) return;
			eventData.activity = sub.fields.getTextInputValue("new_activity") || "";
			await updateDraftByMsgId(message.id, { activity: eventData.activity });
			await sub.editReply({ content: "✅ Activity updated!" });
			await rerender();
			break;
		}
		case "edit_capacity": {
			const sub = await modalInput("modal_edit_capacity", "Edit Capacity", "new_capacity_cap", "Max Capacity");
			if (!sub) return;
			eventData.capacityCap = validateNumber(sub.fields.getTextInputValue("new_capacity_cap"));
			await updateDraftByMsgId(message.id, { capacityCap: eventData.capacityCap });
			await sub.editReply({ content: "✅ Capacity updated!" });
			await rerender();
			break;
		}
		case "edit_start": {
			const sub = await modalInput("modal_edit_start", "Edit Start Time", "new_start", "When does it start?");
			if (!sub) return;
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
			if (!sub) return;
			eventData.lengthMinutes = validateNumber(sub.fields.getTextInputValue("new_length"));
			await updateDraftByMsgId(message.id, { lengthMinutes: eventData.lengthMinutes });
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

			if (!msg) return;
			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: TIMEOUT_TIME_LONG,
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
							{ label: "Art", value: "Art" },
							{ label: "Mindfulness", value: "Mindfulness" },
						])
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			});

			if (!msg) return;
			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: TIMEOUT_TIME_LONG,
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
							{ label: "Group Members Only", value: "Group" },
							{ label: "Friends Can Join : Group+", value: "Group+" },
						])
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			});

			if (!msg) return;
			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: TIMEOUT_TIME_LONG,
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

			if (!msg) return;
			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: TIMEOUT_TIME_LONG,
				filter: (x) => x.user.id === i.user.id && x.customId === "select_platforms",
			});
			col.on("collect", async (s: StringSelectMenuInteraction) => {
				eventData.platforms = JSON.stringify(s.values);
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
							{ label: "No Restriction", value: "verypoor" },
							{ label: "Poor or better", value: "poor" },
							{ label: "Medium or better", value: "medium" },
							{ label: "Good or better", value: "good" },
							{ label: "Excellent", value: "excellent" },
						])
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			});
			if (!msg) return;
			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: TIMEOUT_TIME_LONG,
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
		case "edit_poster": {
			await i.reply({
				content: "Please upload a new poster image in this thread within 30 seconds.",
				flags: MessageFlags.Ephemeral,
			});
			const channel = i.channel as TextChannel | ThreadChannel;
			const collected = await channel.awaitMessages({
				filter: (m) => m.author.id === i.user.id && m.attachments.size > 0,
				max: 1,
				time: TIMEOUT_TIME_SHORT,
			});

			if (collected.size > 0) {
				const msg = collected.first()!
				const attachment = msg.attachments.first();
				if (attachment && attachment.contentType?.startsWith("image/")) {
					const posterUrl = attachment.url;

					// Update DB
					await prisma.event.update({
						where: { id: eventData.id },
						data: { imageUrl: posterUrl },
					});

					// Update hydrated object
					eventData.imageUrl = posterUrl;

					// Quick Check to see if we're editing on a now published event
					const pubCheck = await checkEventPublishedOrDraftOnly(message.id)

					// Update embed
					await message.edit({
						embeds: [buildDraftEmbed(eventData)],
						components: editButtons(message.id, pubCheck),
					});

					await i.followUp({ content: "✅ Poster updated!", flags: MessageFlags.Ephemeral });
				}
			} else {
				await i.followUp({ content: "❌ No image uploaded.", flags: MessageFlags.Ephemeral });
			}
			break;
		}
		case "edit_vrc_description": {
			const sub = await modalInput("modal_edit_vrc_description", "Edit VRC Description", "new_vrc_description", "New VRC Description", eventData.vrcDescription ?? "", 1000);
			if (!sub) return;
			eventData.vrcDescription = sub.fields.getTextInputValue("new_vrc_description") || "";
			await updateDraftByMsgId(message.id, { description: eventData.vrcDescription });
			await sub.editReply({ content: "✅ VRC Description updated!" });
			await rerender();
			break;
		}
		case "edit_vrc_notify": {

			if (!userHasAllowedRole(
				i.member as GuildMember,
				getStandardRolesOrganizer()
			)) {
				await i.reply({ content: `Ask an Admin/Mod/Organizer to do this for you. (for now).`, flags: MessageFlags.Ephemeral });
				break;
			}

			const msg = await i.reply({
				content: "Select whether to notify the vrc group on creation:",
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect("select_vrc_notify", "Choose whether to notify", [
							{ label: "True", value: "True" },
							{ label: "False", value: "False" },
						])
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			});

			if (!msg) return;
			const col = (msg as Message).createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: TIMEOUT_TIME_LONG,
				filter: (x) => x.user.id === i.user.id && x.customId === "select_vrc_notify",
			});
			col.on("collect", async (s: StringSelectMenuInteraction) => {
				eventData.vrcSendNotification = s.values[0] === "True";
				await updateDraftByMsgId(message.id, { vrcSendNotification: eventData.vrcSendNotification });
				await s.update({ content: "✅ Updated!", components: [] });
				await rerender();
			});
			break;
		}

		case "get_event_id":
			await i.reply({ content: `This event's ID is \`${eventData.id}\``, flags: MessageFlags.Ephemeral });
			break;

		case "publish_event": {
			console.log("Start Publishing Event from: " + memberUsername + " at: " + new Date().toISOString());
			try {
				await i.deferUpdate();
				const guild = i.guild as Guild;
				if (!userHasAllowedRoleOrId(i.member as GuildMember, getStandardRolesOrganizer(), [eventData.hostId])) {
					await i.followUp({ content: "❌ Only organisers can publish.", flags: MessageFlags.Ephemeral });
					return;
				}
				await publishEvent(i.client, guild, eventData.id);
				await addHostToEventThread(guild, eventData.id);
				const pubCheck = await checkEventPublishedOrDraftOnly(message.id)
				await i.message.edit({
					embeds: [buildDraftEmbed(eventData)],
					components: editButtons(i.message.id, pubCheck),
				});
				await i.followUp({ content: "✅ Event published!", flags: MessageFlags.Ephemeral });
				await refreshPublishedCalender(i.client, guild.id, true);
			} catch (err) {
				console.error("Publish error:", err);
				await i.followUp({ content: "⚠️ Something went wrong while publishing.", flags: MessageFlags.Ephemeral });
			} finally {
				console.log("Ended Publishing Event from: " + memberUsername + " at: " + new Date().toISOString());
			}
			break;
		}

		case "vrc_publish_event": {
			console.log("Start VRC Publishing Event from: " + memberUsername + " at: " + new Date().toISOString());
			try {
				if (!await hasVrcUpdateCooldownPassed(eventData.id)) {
					await i.reply({ content: "5 min cooldown for vrc update has not passed.", flags: MessageFlags.Ephemeral })
					break;
				}
				await i.deferUpdate();
				await setLastVrcUpdateTime(eventData.id);
				const guild = i.guild as Guild;
				if (!userHasAllowedRoleOrId(i.member as GuildMember, getStandardRolesOrganizer(), [eventData.hostId])) {
					await i.followUp({ content: "❌ Only organisers can publish.", flags: MessageFlags.Ephemeral });
					return;
				}
				// 1) Grab the VRChat cookie for this guild from GuildConfig
				const guildConfig = await prisma.guildConfig.findUnique({
					where: { id: i.guildId as string },
					select: { vrcLoginToken: true },
				});

				const groupId = await getVrcGroupId(i.guildId!);

				if (!groupId) {
					await i.followUp("❌ No VRChat Group ID is set for this server. Tell an admin.");
					return
				}

				const cookie = guildConfig?.vrcLoginToken ?? null;

				if (!cookie) {
					await i.followUp(
						"❌ The bot is not logged into VRChat. Tell an admin."
					);
					return;
				}

				// 2) Check if cookie is still valid
				const valid = await isVrcCookieValid(cookie);
				if (!valid) {
					await i.followUp(
						"❌ VRChat session is no longer valid. Tell an admin."
					);
					return;
				}

				const eventDesc = new VrcEventDescription(
					eventData.title,
					eventData.vrcDescription ? eventData.vrcDescription : eventData.description ?? "",
					subtypeMap[eventData.subtype.toLowerCase()],
					eventData.startTime.toISOString(),
					eventData.lengthMinutes ?? 60,
					eventData.vrcImageId ? eventData.vrcImageId : subtypeImageMap[eventData.subtype.toLowerCase()],
					parseAndMapArray(eventData.platforms, platformMap),
					eventData.vrcSendNotification ?? false,
					15, // host join before minutes
					10 // guest join before minutes
				);

				const createdOrUpdated = await createOrUpdateGroupEvent(
					cookie,
					groupId,
					eventDesc,
					eventData.vrcCalenderEventId ? eventData.vrcCalenderEventId : undefined
				);

				eventData.vrcCalenderEventId = createdOrUpdated?.id;
				eventData.vrcGroupId = groupId;

				// 7) Persist VRChat-related values back to the Event row
				await prisma.event.update({
					where: { id: eventData.id },
					data: {
						vrcCalenderEventId: createdOrUpdated?.id,
						vrcGroupId: groupId,
					},
				});

				await rerender();
				await i.followUp({ content: "✅ Event (re)published to VRC!", flags: MessageFlags.Ephemeral });
			} catch (err) {
				console.error("VRC Publish error:", err);
				await i.followUp({ content: "⚠️ Something went wrong while publishing to vrc: " + err, flags: MessageFlags.Ephemeral });
			} finally {
				console.log("Ended Publishing Event from: " + memberUsername + " at: " + new Date().toISOString());
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

export async function registerAllEventDraftCollectors(client: Client) {
	console.log("🔁 Restoring event draft collectors…");

	// pull all unpublished drafts
	const now = new Date();
	const nowMinusDay = new Date(now.getTime() - 168 * 60 * 60 * 1000); // added 7 days buffer for old drafts
	const drafts = await prisma.event.findMany({
		where: { startTime: { gte: nowMinusDay }, },
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
	const msg = await fetchMsgInThread(thread, draft.draftThreadMessageId);

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

	collector.on("collect", async (i) => handleDraftButton(i, eventData, msg));

	// Re-archive the thread if we opened it
	if (reArchive) {
		try { await thread.setArchived(true, "Restore draft collector (re-archive)"); } catch { }
	}

	console.log(`✅ Restored draft buttons for event ${ev.id}`);
	writeLog(`Restored draft buttons for event ${ev.id}`);
}