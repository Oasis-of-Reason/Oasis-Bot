import {
	SlashCommandBuilder,
	StringSelectMenuInteraction,
	ChatInputCommandInteraction,
	ActionRowBuilder,
	StringSelectMenuBuilder,
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
	Collection,
} from "discord.js";
import * as chrono from "chrono-node";
import { prisma } from "../utils/prisma";
import { userHasAllowedRole, getStandardRolesHost } from "../helpers/securityHelpers";
import { buildDraftEmbed, editButtons, mkSelect, handleDraftButton } from "../helpers/eventDraft";
import { validateNumber } from "../helpers/generalHelpers";

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
			.setStyle(TextInputStyle.Paragraph)
			.setMaxLength(1000);
		const capInput = new TextInputBuilder()
			.setCustomId("capacity_cap")
			.setLabel("Max Capacity")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(activityInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(capInput)
		);

		await interaction.showModal(modal);

		const modalSubmit = await interaction.awaitModalSubmit({
			filter: (i) => i.customId === "event_modal" && i.user.id === interaction.user.id,
			time: 600_000,
		});
		// This creates the **ephemeral original reply** we will delete later
		await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

		const title = modalSubmit.fields.getTextInputValue("title");
		const activity = modalSubmit.fields.getTextInputValue("activity");
		const description = modalSubmit.fields.getTextInputValue("description");
		const capacityCapText = modalSubmit.fields.getTextInputValue("capacity_cap");
		let capacityCap = validateNumber(capacityCapText);

		// Step 2: type/subtype via a message-scoped collector
		const menusMsg = (await modalSubmit.editReply({
			content: "Choose Event Type and Subtype:",
			components: [
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					mkSelect("event_type", "Choose event type:", [
						{ label: "VRC", value: "VRC" },
						{ label: "Discord", value: "Discord" },
					])
				),
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					mkSelect("event_subtype", "Choose subtype:", [
						{ label: "Gaming", value: "Gaming" },
						{ label: "Social", value: "Social" },
						{ label: "Cinema", value: "Cinema" },
					])
				),
			],
		})) as Message;

		let type: string | null = null;
		let subtype: string | null = null;
		const pending = new Set(["event_type", "event_subtype"]);

		const triadCollector = menusMsg.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 120_000,
			filter: (i) => i.user.id === interaction.user.id && pending.has(i.customId),
		});

		await new Promise<void>((resolve) => {
			triadCollector.on("collect", async (i) => {
				const v = (i as any as StringSelectMenuInteraction).values[0];
				if (i.customId === "event_type") type = v;
				if (i.customId === "event_subtype") subtype = v;
				pending.delete(i.customId);
				await i.deferUpdate();
				if (pending.size === 0) {
					triadCollector.stop("done");
					resolve();
				}
			});
			triadCollector.on("end", async () => {
				// delete the ephemeral select message
				try {
					await modalSubmit.deleteReply(menusMsg.id).catch(() => { });
				} catch { }
			});
		});

		// Step 3: VRC extras
		let platforms: string[] = [];
		let requirements: string | null = null;
		let scope: string | null = null;

		if (type === "VRC") {
			const vrcMsg = (await modalSubmit.followUp({
				content: "VRC Specific options:",
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect(
							"event_platforms",
							"Choose platform(s)",
							[
								{ label: "Android", value: "Android" },
								{ label: "PCVR", value: "PCVR" },
							],
							1,
							2
						)
					),
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect("event_requirements", "Choose avatar performance requirement:", [
							{ label: "No Restriction", value: "No Restriction" },
							{ label: "Poor or better", value: "Poor or better" },
							{ label: "Medium or better", value: "Medium or better" },
							{ label: "Good or better", value: "Good or better" },
							{ label: "Excellent", value: "Excellent" },
						])
					),
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect("event_scope", "Instance Type:", [
							{ label: "Group Only", value: "Group" },
							{ label: "Group Plus", value: "Friends" },
						])
					),
				],
				flags: MessageFlags.Ephemeral,
				fetchReply: true,
			})) as Message;

			const vrcPending = new Set(["event_platforms", "event_requirements", "event_scope"]);
			const vrcCollector = vrcMsg.createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: 120_000,
				filter: (i) => i.user.id === interaction.user.id && vrcPending.has(i.customId),
			});

			await new Promise<void>((resolve) => {
				vrcCollector.on("collect", async (i: StringSelectMenuInteraction) => {
					const v = (i as any as StringSelectMenuInteraction).values[0];
					if (i.customId === "event_platforms") platforms = i.values;
					if (i.customId === "event_requirements") requirements = v;
					if (i.customId === "event_scope") scope = v;
					vrcPending.delete(i.customId);
					await i.deferUpdate();
					if (vrcPending.size === 0) {
						vrcCollector.stop("done");
						resolve();
					}
				});
				vrcCollector.on("end", async () => {
					try {
						await modalSubmit.deleteReply(vrcMsg.id).catch(() => { });
					} catch { }
				});
			});
		}

		// Step 4: timing prompt → modal
		const timingMsg = (await modalSubmit.followUp({
			content: "✅ Event basics captured. Now set the timing:",
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder().setCustomId("set_timing").setLabel("⏰ Set Timing").setStyle(ButtonStyle.Primary)
				),
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

		// remove the ephemeral "set timing" prompt once clicked/timed out
		try {
			await modalSubmit.deleteReply(timingMsg.id).catch(() => { });
		} catch { }

		if (!timingBtn) {
			// delete the modalSubmit's ephemeral reply, user will see nothing stale
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
						.setLabel("When does it start? (e.g. 'tomorrow 8pm GMT')")
						.setStyle(TextInputStyle.Short)
						.setRequired(true)
				),
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId("length").setLabel("Length in minutes").setStyle(TextInputStyle.Short)
				)
			);

		await timingBtn.showModal(timingModal);

		const timingSubmit = await timingBtn.awaitModalSubmit({
			filter: (i: any) => i.customId === "event_timing_modal" && i.user.id === interaction.user.id,
			time: 120_000,
		});
		// This creates another ephemeral reply we will delete later
		await timingSubmit.deferReply({ flags: MessageFlags.Ephemeral });

		const startText = timingSubmit.fields.getTextInputValue("start");
		const parsed = chrono.parseDate(startText);
		if (!parsed) {
			await timingSubmit.editReply({ content: "❌ Could not parse that date/time." });
			// clean up both ephemeral replies before exiting
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

		// Step 5: optional poster upload
		const imageMessage = await timingSubmit.followUp({
			content:
				"📌 If you’d like to add a poster image, please upload it in this channel now (you have 60 seconds). Otherwise, ignore this message.",
			flags: MessageFlags.Ephemeral,
			fetchReply: true
		});

		const channel = interaction.channel as TextChannel;
		const collected = await channel.awaitMessages({
			filter: (m) => m.author.id === interaction.user.id && m.attachments.size > 0,
			max: 1,
			time: 60_000,
		});

		let posterUrl: string | null = null;
		if (collected.size > 0) {
			const collectedMsg =  collected.first();
			const attachment = collectedMsg!.attachments.first();
			if (attachment && attachment.contentType?.startsWith("image/")) posterUrl = attachment.url;
		}
		// delete the ephemeral "upload poster" message
		try {
			await timingSubmit.deleteReply(imageMessage.id).catch(() => { });
		} catch { }

		// Step 6: create draft thread + message
		const thread = await channel.threads.create({
			name: `Draft: ${title}`,
			autoArchiveDuration: 1440,
		});

		const eventData = {
			title,
			description,
			activity,
			type,
			subtype,
			scope,
			platforms,
			requirements,
			capacityCap,
			startTime,
			lengthMinutes,
			posterUrl,
			hostId: interaction.user.id,
		};

		const sent = await thread.send({
			embeds: [buildDraftEmbed(eventData)],
			components: editButtons(),
		});
		
		await thread.members.add(interaction.user.id);

		// Step 7: save to DB
		const createdEvent = await prisma.event.create({
			data: {
				guildId: interaction.guildId!,
				draftChannelId: interaction.channelId,
				draftThreadId: thread.id,
				draftThreadMessageId: sent.id,
				hostId: interaction.user.id,
				title: eventData.title,
				type: eventData.type ?? "Discord",
				subtype: eventData.subtype ?? "Social",
				capacityBase: 0,
				capacityCap: eventData.capacityCap,
				startTime: eventData.startTime,
				lengthMinutes: eventData.lengthMinutes ?? 0,
				published: false,
				...(eventData.activity ? { activity: eventData.activity } : {}),
				...(eventData.type === "VRC" && eventData.platforms?.length
					? { platforms: JSON.stringify(eventData.platforms) }
					: {}),
				...(eventData.type === "VRC" && eventData.requirements ? { requirements: eventData.requirements } : {}),
				...(eventData.description ? { description: eventData.description } : {}),
				...(eventData.scope ? { scope: eventData.scope } : {}),
				...(eventData.posterUrl ? { imageUrl: eventData.posterUrl } : {}),
			},
		});

		// CLEANUP: delete both ephemeral interaction replies (modal & timing)
		try {
			await timingSubmit.deleteReply();
		} catch { }
		try {
			await modalSubmit.deleteReply();
		} catch { }


		// FINAL COMPLETION MESSAGE (the only ephemeral we keep visible)
		await interaction.followUp({
			content: `✅ Event draft created in thread <#${thread.id}>`,
			flags: MessageFlags.Ephemeral,
		});

		// Step 8: attach button collector (scoped)
		const hydrated = {
			id: createdEvent.id,
			hostId: createdEvent.hostId,
			title: createdEvent.title,
			description: createdEvent.description,
			activity: (createdEvent as any).activity ?? null,
			type: createdEvent.type,
			subtype: createdEvent.subtype,
			scope: createdEvent.scope,
			platforms: createdEvent.platforms ? JSON.parse(createdEvent.platforms as any) : null,
			requirements: createdEvent.requirements,
			capacityCap: createdEvent.capacityCap,
			startTime: createdEvent.startTime,
			lengthMinutes: createdEvent.lengthMinutes,
			posterUrl: createdEvent.imageUrl ?? null,
		};

		const btnCollector = sent.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 10 * 60_000,
			filter: (i) => i.user.id === interaction.user.id, // host-only
		});

		btnCollector.on("collect", async (i) => handleDraftButton(i, hydrated, sent));
	},
};
