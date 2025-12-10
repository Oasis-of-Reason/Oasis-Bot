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
} from "discord.js";
import * as chrono from "chrono-node";
import { prisma } from "../utils/prisma";
import { userHasAllowedRole, getStandardRolesHost } from "../helpers/securityHelpers";
import { buildDraftEmbed, editButtons, handleDraftButton } from "../helpers/eventDraft";
import { validateNumber } from "../helpers/generalHelpers";
import { updateThreadTitle } from "../helpers/refreshEventMessages"

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
function canContinue(type: string | null, subtype: string | null, platforms: Set<string>, req: string | null, scope: string | null) {
	if (!type || !subtype) return false;
	if (type !== "VRC") return true; // Discord-only flow
	return platforms.size > 0 && !!req && !!scope;
}

function buildAllRows(
	type: string | null,
	subtype: string | null,
	platforms: Set<string>,
	requirements: string | null,
	scope: string | null
) {
	const isVRC = type === "VRC";

	const typeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("type:VRC").setLabel("VRC").setStyle(styleSingleChoice(type, "VRC")),
		new ButtonBuilder().setCustomId("type:Discord").setLabel("Discord").setStyle(styleSingleChoice(type, "Discord")),
	);

	const subRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("sub:Gaming").setLabel("Gaming").setStyle(styleSingleChoice(subtype, "Gaming")),
		new ButtonBuilder().setCustomId("sub:Social").setLabel("Social").setStyle(styleSingleChoice(subtype, "Social")),
		new ButtonBuilder().setCustomId("sub:Cinema").setLabel("Cinema").setStyle(styleSingleChoice(subtype, "Cinema")),
		new ButtonBuilder().setCustomId("sub:Art").setLabel("Art").setStyle(styleSingleChoice(subtype, "Art")),
		new ButtonBuilder().setCustomId("sub:Mindfulness").setLabel("Mindfulness").setStyle(styleSingleChoice(subtype, "Mindfullness")),
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



module.exports = {
	data: new SlashCommandBuilder().setName("create-event").setDescription("Start the event creation wizard"),

	async execute(interaction: ChatInputCommandInteraction) {
		const guildConfig = await prisma.guildConfig.findUnique({ where: { id: interaction.guildId as string } });

		if (interaction.channelId !== (guildConfig?.draftChannelId ?? "")) {
			await interaction.reply({
				content: "❌ This command can only be used in the event drafting channel.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (!userHasAllowedRole(interaction.member as GuildMember, getStandardRolesHost())) {
			await interaction.reply({
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

		await interaction.showModal(modal);

		const modalSubmit = await interaction.awaitModalSubmit({
			filter: (i) => i.customId === "event_modal" && i.user.id === interaction.user.id,
			time: 600_000,
		});
		await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

		const title = modalSubmit.fields.getTextInputValue("title");
		const activity = modalSubmit.fields.getTextInputValue("activity");
		const description = modalSubmit.fields.getTextInputValue("description");
		const capacityCapText = modalSubmit.fields.getTextInputValue("capacity_cap");
		let capacityCap = validateNumber(capacityCapText);

		// Step 2: show ALL buttons at once
		let type: string = "";
		let subtype: string  ="";
		let platformsSet = new Set<string>();
		let requirements: string = "";
		let scope: string = "";

		const allMsg = (await modalSubmit.editReply({
			content:
				"**Configure your event:**\n" +
				"• Event Type\n" +
				"• Event Subtype\n" +
				"• VRC Platforms (Select multiple)\n" +
				"• VRC Avatar performance restrictions\n" +
				"• VRC instance type\n" +
				"**When all required fields are set, you'll continue automatically.**",
			components: buildAllRows(type, subtype, platformsSet, requirements, scope),
		})) as Message;

		const proceed = await new Promise<boolean>((resolve) => {
			const coll = allMsg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 300_000,
				filter: (i) => i.user.id === interaction.user.id,
			});

			const isReady = () =>
				!!type &&
				!!subtype &&
				(type !== "VRC" || (platformsSet.size > 0 && !!requirements && !!scope));

			coll.on("collect", async (i) => {
				const [kind, value] = i.customId.split(":");

				if (kind === "type") {
					type = value;
					if (type !== "VRC") {
						// clear VRC-only values
						platformsSet.clear();
						requirements = "";
						scope = "";
					}
				} else if (kind === "sub") {
					subtype = value;
				} else if (kind === "plat" && type === "VRC") {
					if (platformsSet.has(value)) platformsSet.delete(value);
					else platformsSet.add(value);
				} else if (kind === "req" && type === "VRC") {
					requirements = value;
				} else if (kind === "scope" && type === "VRC") {
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
				try { await modalSubmit.deleteReply(allMsg.id).catch(() => { }); } catch { }
				if (reason !== "done") resolve(false);
			});
		});

		// Step 3: timing prompt → modal
		const timingMsg = (await modalSubmit.followUp({
			content: "✅ Event basics captured. Now set the timing:",
			components: [
				row(new ButtonBuilder().setCustomId("set_timing").setLabel("⏰ Set Timing").setStyle(ButtonStyle.Primary)),
			],
			flags: MessageFlags.Ephemeral,
			fetchReply: true,
		})) as Message;

		const timingBtn = await new Promise<any>((resolve) => {
			const c = timingMsg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 300_000,
				filter: (i) => i.user.id === interaction.user.id && i.customId === "set_timing",
			});
			c.on("collect", (i) => resolve(i));
			c.on("end", (collected) => collected.size === 0 && resolve(null));
		});

		try {
			await modalSubmit.deleteReply(timingMsg.id).catch(() => { });
		} catch { }

		if (!timingBtn) {
			try {
				await modalSubmit.deleteReply();
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
			filter: (i: any) => i.customId === "event_timing_modal" && i.user.id === interaction.user.id,
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
				await modalSubmit.deleteReply();
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

		const channel = interaction.channel as TextChannel;
		const collected = await channel.awaitMessages({
			filter: (m) => m.author.id === interaction.user.id && m.attachments.size > 0,
			max: 1,
			time: 60_000,
		});

		let imageUrl: string = "";
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
			hostId: interaction.user.id,
			vrcCalenderEventId: "",
			vrcSendNotification: false,
			vrcDescription: "",
			vrcImageId: "",
			vrcGroupId: "",
		};

		const createdEvent = await prisma.event.create({
			data: {
				guildId: interaction.guildId!,
				draftChannelId: interaction.channelId,
				draftThreadId: thread.id,
				draftThreadMessageId: null,
				hostId: interaction.user.id,
				title: eventData.title,
				type: eventData.type ?? "Discord",
				subtype: eventData.subtype ?? "Social",
				activity: eventData.activity ?? "",
				platforms: eventData.platforms,
				requirements: eventData.type === "VRC" ? eventData.requirements ?? "" : "",
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
		await updateThreadTitle(interaction.client, thread.id, eventData.title, eventData.id)

		const sent = await thread.send({
			embeds: [buildDraftEmbed(eventData)],
			components: editButtons(thread.id),
		});

		await prisma.event.update({
			where: { id: createdEvent.id },
			data: { draftThreadMessageId: sent.id },
		});

		await thread.members.add(interaction.user.id);

		// Clean up ephemeral replies (only final success remains)
		try {
			await timingSubmit.deleteReply();
		} catch { }
		try {
			await modalSubmit.deleteReply();
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
		
		btnCollector.on("collect", async (i) => handleDraftButton(i, hydrated, sent));
	},
};
