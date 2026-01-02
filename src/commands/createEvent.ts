import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	ActionRowBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ComponentType,
	TextChannel,
	ButtonBuilder,
	ButtonStyle,
	GuildMember,
	Message,
	MessageFlags,
	ModalSubmitInteraction,
	InteractionCallbackResponse,
} from "discord.js";
import * as chrono from "chrono-node";
import { prisma } from "../utils/prisma";
import { userHasAllowedRole, getStandardRolesHost } from "../helpers/securityHelpers";
import { buildDraftEmbed, editButtons, handleDraftButton } from "../helpers/eventDraft";
import { validateNumber } from "../helpers/generalHelpers";
import { updateThreadTitle } from "../helpers/refreshEventMessages"
import { EVENT_SUBTYPE_META } from "../helpers/eventSubTypes";
import { track, TrackedInteraction } from "../utils/interactionSystem";

module.exports = {
	data: new SlashCommandBuilder().setName("create-event").setDescription("Start the event creation wizard"),

	async execute(ix: TrackedInteraction) {
		const guildConfig = await prisma.guildConfig.findUnique({ where: { id: ix.guildId as string } });

		if (ix.channelId !== (guildConfig?.draftChannelId ?? "")) {
			await ix.reply({
				content: "❌ This command can only be used in the event drafting channel.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (!userHasAllowedRole(ix.interaction.member as GuildMember, getStandardRolesHost())) {
			await ix.reply({
				content: "❌ You don't have permission for this command.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Step 1: modal
		const modal = new ModalBuilder().setCustomId("event_modal").setTitle("Create Event");
		const titleInput = new TextInputBuilder()
			.setCustomId("title")
			.setLabel("Event Title")
			.setStyle(TextInputStyle.Short)
			.setMaxLength(90)
			.setRequired(true);
		const activityInput = new TextInputBuilder()
			.setCustomId("activity")
			.setLabel("What game, world or movie is this for")
			.setStyle(TextInputStyle.Short)
			.setMaxLength(50);
		const descInput = new TextInputBuilder()
			.setCustomId("description")
			.setLabel("Description")
			.setPlaceholder("Provide a brief description of your event.")
			.setStyle(TextInputStyle.Paragraph)
			.setMaxLength(4000);
		const capInput = new TextInputBuilder()
			.setCustomId("capacity_cap")
			.setLabel("Max Capacity")
			.setPlaceholder("How many attendess? Over Cap go waitlist. Dont forget hosts & co-hosts!")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(activityInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(capInput),
		);

		await ix.showModal(modal);

		const modalSubmitResponse = await ix.awaitModalSubmitTracked({
			filter: (i) => i.customId === "event_modal" && i.user.id === ix.interaction.user.id,
			time: 600_000,
		});
		const modalSubmit = modalSubmitResponse.tracked;
		await modalSubmit?.deferReply({ ephemeral: true });

		const modalInteraction = modalSubmit?.interaction as ModalSubmitInteraction
		const title = modalInteraction.fields.getTextInputValue("title");
		const activity = modalInteraction.fields.getTextInputValue("activity");
		const description = modalInteraction.fields.getTextInputValue("description");
		const capacityCapText = modalInteraction.fields.getTextInputValue("capacity_cap");
		let capacityCap = validateNumber(capacityCapText);

		// Step 2: show ALL buttons at once
		let type: string = "";
		let subtype: string  ="";
		let platformsSet = new Set<string>();
		let requirements: string = "";
		let scope: string = "";

		const modalResponse = (await modalSubmit?.editReply({
			content:
				"**Configure your event:**\n" +
				"• Event Type\n" +
				"• Event Subtype\n" +
				"• VRC Platforms (Select multiple)\n" +
				"• VRC Avatar performance restrictions\n" +
				"• VRC instance type\n" +
				"**When all required fields are set, you'll continue automatically.**",
			components: buildAllRows(type, subtype, platformsSet, requirements, scope),
		}));
		const msg = modalResponse?.response as Message
		const proceed = await new Promise<boolean>((resolve) => {
			const coll = msg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 300_000,
				filter: (i) => i.user.id === ix.interaction.user.id,
			});

			const isReady = () =>
				!!type &&
				!!subtype &&
				(type !== "VRCHAT" || (platformsSet.size > 0 && !!requirements && !!scope));

			coll.on("collect", async (i) => {
				const [kind, value] = i.customId.split(":");

				if (kind === "type") {
					type = value;
					if (type !== "VRCHAT") {
						// clear VRCHAT-only values
						platformsSet.clear();
						requirements = "";
						scope = "";
					}
				} else if (kind === "sub") {
					subtype = value;
				} else if (kind === "plat" && type === "VRCHAT") {
					if (platformsSet.has(value)) platformsSet.delete(value);
					else platformsSet.add(value);
				} else if (kind === "req" && type === "VRCHAT") {
					requirements = value;
				} else if (kind === "scope" && type === "VRCHAT") {
					scope = value;
				}

				// Update visual state
				await i.update({
					content: i.message.content,
					components: buildAllRows(type, subtype, platformsSet, requirements, scope),
				});

				// Auto-advance if complete
				if (isReady()) {
					coll.stop("done");
					resolve(true);
				}
			});

			coll.on("end", async (_c, reason) => {
				// delete this config ephemeral
				try { await (modalSubmit?.interaction as ModalSubmitInteraction).deleteReply(msg.id).catch(() => { }); } catch { }
				if (reason !== "done") resolve(false);
			});
		});

		// Step 3: timing prompt → modal
		const followUpResponse = (await modalSubmit?.followUp({
			content: "✅ Event basics captured. Now set the timing:",
			components: [
				row(new ButtonBuilder().setCustomId("set_timing").setLabel("⏰ Set Timing").setStyle(ButtonStyle.Primary)),
			],
			flags: MessageFlags.Ephemeral,
			fetchReply: true,
		}));
		const timingMsg = followUpResponse?.response as Message;
		const timingBtn = await new Promise<any>((resolve) => {
			const c = timingMsg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 300_000,
				filter: (i) => i.user.id === ix.interaction.user.id && i.customId === "set_timing",
			});
			c.on("collect", (i) => resolve(i));
			c.on("end", (collected) => collected.size === 0 && resolve(null));
		});

		try {
			await (modalSubmit?.interaction as ModalSubmitInteraction).deleteReply(timingMsg.id).catch(() => { });
		} catch { }

		if (!timingBtn) {
			try {
				await (modalSubmit?.interaction as ModalSubmitInteraction).deleteReply();
			} catch { }
			return;
		}

		const timingModal = new ModalBuilder()
			.setCustomId("event_timing_modal")
			.setTitle("Event Timing")
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder()
						.setCustomId("start")
						.setLabel("When does it start?")
						.setPlaceholder('e.g tomorrow 8pm GMT | in 3 days at 4pm')
						.setStyle(TextInputStyle.Short)
						.setRequired(true),
				),
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId("length").setLabel("Length in minutes").setStyle(TextInputStyle.Short),
				),
			);

		await timingBtn.showModal(timingModal);

		const timingSubmit = await timingBtn.awaitModalSubmit({
			filter: (i: any) => i.customId === "event_timing_modal" && i.user.id === ix.interaction.user.id,
			time: 120_000,
		});
		await timingSubmit.deferReply({ flags: MessageFlags.Ephemeral });

		const startText = timingSubmit.fields.getTextInputValue("start");
		const parsed = chrono.parseDate(startText);
		if (!parsed) {
			await timingSubmit.editReply({ content: "❌ Could not parse that date/time." });
			try {
				await timingSubmit.deleteReply();
			} catch { }
			try {
				await (modalSubmit?.interaction as ModalSubmitInteraction).deleteReply();
			} catch { }
			return;
		}
		const startTime = parsed;
		const lengthStr = timingSubmit.fields.getTextInputValue("length");
		let lengthMinutes = validateNumber(lengthStr);

		// Step 4: optional poster upload
		const imageMessage = await timingSubmit.followUp({
			content:
				"📌 If you’d like to add a poster image, please upload it in this channel now (you have 60 seconds). Otherwise, ignore this message.",
			flags: MessageFlags.Ephemeral,
			fetchReply: true,
		});

		const channel = ix.interaction.channel as TextChannel;
		const collected = await channel.awaitMessages({
			filter: (m) => m.author.id === ix.interaction.user.id && m.attachments.size > 0,
			max: 1,
			time: 60_000,
		});

		let imageUrl: string = "https://cdn.discordapp.com/attachments/1414942384273227806/1442982567853949133/VRChat_2025-11-22_21-19-54.942_2160x3840.png?";
		if (collected.size > 0) {
			const collectedMsg = collected.first();
			const attachment = collectedMsg!.attachments.first();
			if (attachment && attachment.contentType?.startsWith("image/")) imageUrl = attachment.url ?? "";
		}
		try {
			await timingSubmit.deleteReply(imageMessage.id).catch(() => { });
		} catch { }

		// Step 5: create draft thread + message
		const thread = await channel.threads.create({
			name: `Draft: ${title}`,
			autoArchiveDuration: 1440,
		});

		const eventData = {
			id: 0,
			title,
			description,
			activity,
			type,
			subtype,
			scope,
			platforms: JSON.stringify(Array.from(platformsSet)),
			requirements,
			capacityCap,
			startTime,
			lengthMinutes,
			imageUrl,
			hostId: ix.interaction.user.id,
			vrcCalenderEventId: "",
			vrcSendNotification: false,
			vrcDescription: "",
			vrcImageId: "",
			vrcGroupId: "",
		};

		const createdEvent = await prisma.event.create({
			data: {
				guildId: ix.guildId!,
				draftChannelId: ix.channelId,
				draftThreadId: thread.id,
				draftThreadMessageId: null,
				hostId: ix.interaction.user.id,
				title: eventData.title,
				type: eventData.type as any,
				subtype: eventData.subtype as any,
				activity: eventData.activity ?? "",
				platforms: eventData.platforms,
				requirements: eventData.type === "VRCHAT" ? eventData.requirements ?? "" : "",
				description: eventData.description ?? "",
				scope: eventData.scope ?? "",
				capacityBase: 0,
				capacityCap: eventData.capacityCap,
				startTime: eventData.startTime,
				lengthMinutes: eventData.lengthMinutes ?? 0,
				published: false,
				imageUrl: eventData.imageUrl ?? "",
				vrcCalenderEventId: "",
				vrcSendNotification: false,
				vrcDescription: "",
				vrcImageId: "",
				vrcGroupId: "",
			},
		});

		eventData.id = createdEvent.id
		// we have the correct id now so lets update the title
		await updateThreadTitle(ix.interaction.client, thread.id, eventData.title, eventData.id)

		const sent = await thread.send({
			embeds: [buildDraftEmbed(eventData)],
			components: editButtons(thread.id),
		});

		await prisma.event.update({
			where: { id: createdEvent.id },
			data: { draftThreadMessageId: sent.id },
		});

		await thread.members.add(ix.interaction.user.id);

		// Clean up ephemeral replies (only final success remains)
		try {
			await timingSubmit.deleteReply();
		} catch { }
		try {
			await (modalSubmit?.interaction as ModalSubmitInteraction).deleteReply();
		} catch { }

		/*await interaction.followUp({
			content: `✅ Event draft created in thread <#${thread.id}>`,
			flags: MessageFlags.Ephemeral,
		});*/

		// Step 7: attach button collector (scoped)
		const hydrated = {
			id: createdEvent.id,
			hostId: createdEvent.hostId,
			title: createdEvent.title,
			description: createdEvent.description ?? "",
			activity: (createdEvent as any).activity ?? null,
			type: createdEvent.type,
			subtype: createdEvent.subtype,
			scope: createdEvent.scope ?? "",
			platforms: createdEvent.platforms ?? "",
			requirements: createdEvent.requirements ?? "",
			capacityCap: createdEvent.capacityCap,
			startTime: createdEvent.startTime,
			lengthMinutes: createdEvent.lengthMinutes ?? 0,
			imageUrl: createdEvent.imageUrl ?? "",
			vrcCalenderEventId: createdEvent.vrcCalenderEventId ?? "",
			vrcSendNotification: createdEvent.vrcSendNotification ?? false,
			vrcDescription: createdEvent.vrcDescription ?? "",
			vrcImageId: createdEvent.vrcImageId ?? "",
			vrcGroupId: createdEvent.vrcGroupId ?? ""
		};

		const btnCollector = sent.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 0,
		});
		
		btnCollector.on("collect", async (i) => handleDraftButton(track(i, "From Create Event", hydrated.id + " " + hydrated.title + " By: " + hydrated.hostId), hydrated, sent));
	},
};

function buildAllRows(
	type: string | null,
	subtype: string | null,
	platforms: Set<string>,
	requirements: string | null,
	scope: string | null
) {
	const isVRC = type === "VRCHAT";

	const typeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("type:VRCHAT").setLabel("VRC").setStyle(styleSingleChoice(type, "VRCHAT")),
		new ButtonBuilder().setCustomId("type:DISCORD").setLabel("Discord").setStyle(styleSingleChoice(type, "DISCORD")),
	);

	const subRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		(Object.keys(EVENT_SUBTYPE_META) as (keyof typeof EVENT_SUBTYPE_META)[]).map((subtypeKey) =>
			new ButtonBuilder()
				.setCustomId(`sub:${subtypeKey}`) // e.g., "sub:GAMING"
				.setLabel(EVENT_SUBTYPE_META[subtypeKey].label) // e.g., "Gaming"
				.setStyle(styleSingleChoice(subtype, subtypeKey)) // current selection check
		)
	);

	const platRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("plat:Android")
			.setLabel("Android")
			.setStyle(styleMultiChoice(platforms, "Android"))
			.setDisabled(!isVRC),
		new ButtonBuilder()
			.setCustomId("plat:PCVR")
			.setLabel("PCVR")
			.setStyle(styleMultiChoice(platforms, "PCVR"))
			.setDisabled(!isVRC),
	);

	const reqRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("req:verypoor")
			.setLabel("No Restriction")
			.setStyle(styleSingleChoice(requirements, "verypoor"))
			.setDisabled(!isVRC),
		new ButtonBuilder()
			.setCustomId("req:poor")
			.setLabel("Poor+")
			.setStyle(styleSingleChoice(requirements, "poor"))
			.setDisabled(!isVRC),
		new ButtonBuilder()
			.setCustomId("req:medium")
			.setLabel("Medium+")
			.setStyle(styleSingleChoice(requirements, "medium"))
			.setDisabled(!isVRC),
		new ButtonBuilder()
			.setCustomId("req:good")
			.setLabel("Good+")
			.setStyle(styleSingleChoice(requirements, "good"))
			.setDisabled(!isVRC),
		new ButtonBuilder()
			.setCustomId("req:excellent")
			.setLabel("Excellent")
			.setStyle(styleSingleChoice(requirements, "excellent"))
			.setDisabled(!isVRC),
	);

	const scopeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("scope:Group")
			.setLabel("Group Only")
			.setStyle(styleSingleChoice(scope, "Group"))
			.setDisabled(!isVRC),
		new ButtonBuilder()
			.setCustomId("scope:Group+")
			.setLabel("Group Plus")
			.setStyle(styleSingleChoice(scope, "Friends"))
			.setDisabled(!isVRC),
	);

	// Exactly 5 rows
	return [typeRow, subRow, platRow, reqRow, scopeRow];
}

// ---------- helpers for button UIs ----------
function row(...btns: ButtonBuilder[]) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(...btns);
}
function styleSingleChoice(current: string | null, value: string) {
	return current === value ? ButtonStyle.Primary : ButtonStyle.Secondary;
}
function styleMultiChoice(current: Set<string>, value: string) {
	return current.has(value) ? ButtonStyle.Success : ButtonStyle.Secondary;
}