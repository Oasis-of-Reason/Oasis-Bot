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
} from "discord.js";
import * as chrono from "chrono-node";
import { prisma } from "../utils/prisma";
import { userHasAllowedRole, getStandardRolesHost, getStandardRolesOrganizer } from "../helpers/securityHelpers";
import { buildDraftEmbed, editButtons, mkSelect, handleDraftButton } from "../helpers/eventDraft";

module.exports = {
	data: new SlashCommandBuilder().setName("create-event").setDescription("Start the event creation wizard"),

	async execute(interaction: ChatInputCommandInteraction) {
		const guildConfig = await prisma.guildConfig.findUnique({ where: { id: interaction.guildId as string } });

		if (interaction.channelId !== (guildConfig?.draftChannelId ?? "")) {
			await interaction.reply({ content: "❌ This command can only be used in the event drafting channel.", ephemeral: true });
			return;
		}

		if (!userHasAllowedRole(interaction.member as GuildMember, getStandardRolesHost())) {
			await interaction.reply({ content: "❌ You don't have permission for this command.", ephemeral: true });
			return;
		}

		// Step 1: modal
		const modal = new ModalBuilder().setCustomId("event_modal").setTitle("Create Event");
		const titleInput = new TextInputBuilder()
			.setCustomId("title").setLabel("Event Title").setStyle(TextInputStyle.Short).setMaxLength(90).setRequired(true);
		const activityInput = new TextInputBuilder()
			.setCustomId("activity").setLabel("What game, world or movie is this for").setStyle(TextInputStyle.Short).setMaxLength(50);
		const descInput = new TextInputBuilder()
			.setCustomId("description").setLabel("Description").setStyle(TextInputStyle.Paragraph).setMaxLength(1000);
		const capInput = new TextInputBuilder()
			.setCustomId("capacity_cap").setLabel("Max Capacity").setStyle(TextInputStyle.Short).setRequired(true);

		modal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(activityInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(capInput),
		);

		await interaction.showModal(modal);

		const modalSubmit = await interaction.awaitModalSubmit({
			filter: (i) => i.customId === "event_modal" && i.user.id === interaction.user.id,
			time: 120_000,
		});
		await modalSubmit.deferReply({ ephemeral: true });

		const title = modalSubmit.fields.getTextInputValue("title");
		const activity = modalSubmit.fields.getTextInputValue("activity");
		const description = modalSubmit.fields.getTextInputValue("description");
		let capacityCap = parseInt(modalSubmit.fields.getTextInputValue("capacity_cap"), 10);
		if (Number.isNaN(capacityCap)) capacityCap = 0;

		// Step 2: type/subtype/scope via a message-scoped collector
		const menusMsg = (await modalSubmit.editReply({
			content: "Choose type, subtype, and scope:",
			components: [
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					mkSelect("event_type", "Choose event type", [
						{ label: "VRC", value: "VRC" },
						{ label: "Discord", value: "Discord" },
					])
				),
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					mkSelect("event_subtype", "Choose subtype", [
						{ label: "Gaming", value: "Gaming" },
						{ label: "Social", value: "Social" },
						{ label: "Cinema", value: "Cinema" },
					])
				),
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
					mkSelect("event_scope", "Who can join?", [
						{ label: "Group Only", value: "Group" },
						{ label: "Friends Can Join", value: "Friends" },
					])
				),
			],
		})) as Message;

		let type: string | null = null;
		let subtype: string | null = null;
		let scope: string | null = null;
		const pending = new Set(["event_type", "event_subtype", "event_scope"]);

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
				if (i.customId === "event_scope") scope = v;
				pending.delete(i.customId);
				await i.deferUpdate();
				if (pending.size === 0) {
					triadCollector.stop("done");
					resolve();
				}
			});
			triadCollector.on("end", async () => {
				try { await menusMsg.edit({ components: [] }); } catch { }
			});
		});

		// Step 3: VRC extras
		let platforms: string[] = [];
		let requirements: string | null = null;

		if (type === "VRC") {
			const vrcMsg = (await modalSubmit.followUp({
				content: "VRC options:",
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect("event_platforms", "Choose platform(s)", [
							{ label: "Android", value: "Android" },
							{ label: "PCVR", value: "PCVR" },
						], 1, 2)
					),
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
						mkSelect("event_requirements", "Choose avatar performance requirement", [
							{ label: "No Restriction", value: "No Restriction" },
							{ label: "Poor or better", value: "Poor or better" },
							{ label: "Medium or better", value: "Medium or better" },
							{ label: "Good or better", value: "Good or better" },
							{ label: "Excellent", value: "Excellent" },
						])
					),
				],
				ephemeral: true,
				fetchReply: true,
			})) as Message;

			const vrcPending = new Set(["event_platforms", "event_requirements"]);
			const vrcCollector = vrcMsg.createMessageComponentCollector({
				componentType: ComponentType.StringSelect,
				time: 120_000,
				filter: (i) => i.user.id === interaction.user.id && vrcPending.has(i.customId),
			});

			await new Promise<void>((resolve) => {
				vrcCollector.on("collect", async (i: StringSelectMenuInteraction) => {
					if (i.customId === "event_platforms") platforms = i.values;
					if (i.customId === "event_requirements") requirements = i.values[0];
					vrcPending.delete(i.customId);
					await i.deferUpdate();
					if (vrcPending.size === 0) {
						vrcCollector.stop("done");
						resolve();
					}
				});
				vrcCollector.on("end", async () => {
					try { await vrcMsg.edit({ components: [] }); } catch { }
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
			ephemeral: true,
			fetchReply: true,
		})) as Message;

		const timingBtn = await new Promise<any>((resolve) => {
			const c = timingMsg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 120_000,
				filter: (i) => i.user.id === interaction.user.id && i.customId === "set_timing",
			});
			c.on("collect", (i) => resolve(i));
			c.on("end", (collected) => collected.size === 0 && resolve(null));
		});

		if (!timingBtn) {
			await modalSubmit.editReply({ content: "⏳ Timing step timed out — run `/create-event` again." });
			return;
		}

		const timingModal = new ModalBuilder()
			.setCustomId("event_timing_modal")
			.setTitle("Event Timing")
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId("start").setLabel("When does it start? (e.g. 'tomorrow 8pm GMT')").setStyle(TextInputStyle.Short).setRequired(true)
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
		await timingSubmit.deferReply({ ephemeral: true });

		const startText = timingSubmit.fields.getTextInputValue("start");
		const lengthStr = timingSubmit.fields.getTextInputValue("length");
		const parsed = chrono.parseDate(startText);
		if (!parsed) {
			await timingSubmit.editReply({ content: "❌ Could not parse that date/time." });
			return;
		}
		const startTime = parsed;
		let lengthMinutes = lengthStr ? parseInt(lengthStr, 10) : 0;
		if (Number.isNaN(lengthMinutes)) lengthMinutes = 0;

		// Step 5: optional poster upload
		await timingSubmit.followUp({
			content: "📌 If you’d like to add a poster image, please upload it in this channel now (you have 60 seconds). Otherwise, ignore this message.",
			ephemeral: true,
		});

		const channel = interaction.channel as TextChannel;
		const collected = await channel.awaitMessages({
			filter: (m) => m.author.id === interaction.user.id && m.attachments.size > 0,
			max: 1,
			time: 60_000,
		});

		let posterUrl: string | null = null;
		if (collected.size > 0) {
			const attachment = collected.first()!.attachments.first();
			if (attachment && attachment.contentType?.startsWith("image/")) posterUrl = attachment.url;
		}

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

		// Step 7: save to DB (note: platforms stored as JSON string if set)
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
				...(eventData.type === "VRC" && eventData.platforms?.length ? { platforms: JSON.stringify(eventData.platforms) } : {}),
				...(eventData.type === "VRC" && eventData.requirements ? { requirements: eventData.requirements } : {}),
				...(eventData.description ? { description: eventData.description } : {}),
				...(eventData.scope ? { scope: eventData.scope } : {}),
				...(eventData.posterUrl ? { imageUrl: eventData.posterUrl } : {}),
			},
		});

		await timingSubmit.editReply({ content: `✅ Event draft created in thread <#${thread.id}>` });

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
