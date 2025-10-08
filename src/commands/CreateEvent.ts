import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuInteraction,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ComponentType,
	MessageFlags,
	TextChannel,
	ButtonBuilder,
	ButtonStyle,
	GuildMember,
	Guild
} from "discord.js";
import {
	userHasAllowedRole,
	getStandardRolesHost,
	getStandardRolesOrganizer
} from "../helpers/securityHelpers";
import * as chrono from "chrono-node";
import { prisma } from "../utils/prisma";
import { publishEvent } from "../helpers/publishEvent";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("create-event")
		.setDescription("Start the event creation wizard"),

	async execute(interaction: ChatInputCommandInteraction) {

		const guildConfig = await prisma.guildConfig.findUnique({
			where: { id: interaction.guildId as string }
		});

		if (interaction.channelId !== (guildConfig?.draftChannelId ?? "")) {
			await interaction.reply({
				content: "❌ This command can only be used in the #draft-event channel.",
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

		// --- Step 1: Modal with text fields ---
		const eventModal = new ModalBuilder()
			.setCustomId("event_modal")
			.setTitle("Create Event");

		const titleInput = new TextInputBuilder()
			.setCustomId("title")
			.setLabel("Event Title")
			.setStyle(TextInputStyle.Short)
			.setMaxLength(90) // Error on thread name over 100, -10 for extra chars we add to that thread title.
			.setRequired(true);

		const activityInput = new TextInputBuilder()
			.setCustomId("activity")
			.setLabel("What game, world or movie is this for")
			.setStyle(TextInputStyle.Short)
			.setMaxLength(50)
			.setRequired(false);

		const descInput = new TextInputBuilder()
			.setCustomId("description")
			.setLabel("Description")
			.setStyle(TextInputStyle.Paragraph)
			.setMaxLength(1000) //1024 max for embed field
			.setRequired(false);

		const capInput = new TextInputBuilder()
			.setCustomId("capacity_cap")
			.setLabel("Max Capacity")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		eventModal.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(activityInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
			new ActionRowBuilder<TextInputBuilder>().addComponents(capInput),
		);

		await interaction.showModal(eventModal);

		const modalSubmit = await interaction.awaitModalSubmit({
			filter: (i) => i.customId === "event_modal" && i.user.id === interaction.user.id,
			time: 120_000,
		});

		await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

		const title = modalSubmit.fields.getTextInputValue("title");
		const activity = modalSubmit.fields.getTextInputValue("activity");
		const description = modalSubmit.fields.getTextInputValue("description");

		let capacityCap = parseInt(modalSubmit.fields.getTextInputValue("capacity_cap"), 10) ?? 0;
		if(Number.isNaN(capacityCap)) capacityCap = 0;

		// --- Step 2: Dropdowns (type, subtype, scope) ---
		const typeMenu = new StringSelectMenuBuilder()
			.setCustomId("event_type")
			.setPlaceholder("Choose event type")
			.addOptions([
				{ label: "VRC", value: "VRC" },
				{ label: "Discord", value: "Discord" },
			]);

		const subtypeMenu = new StringSelectMenuBuilder()
			.setCustomId("event_subtype")
			.setPlaceholder("Choose subtype")
			.addOptions([
				{ label: "Gaming", value: "Gaming" },
				{ label: "Social", value: "Social" },
				{ label: "Cinema", value: "Cinema" },
			]);

		const scopeMenu = new StringSelectMenuBuilder()
			.setCustomId("event_scope")
			.setPlaceholder("Who can join?")
			.addOptions([
				{ label: "Group Only", value: "Group" },
				{ label: "Friends Can Join", value: "Friends" },
			]);

		await modalSubmit.editReply({
			content: "Choose type, subtype, and scope:",
			components: [
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(typeMenu),
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(subtypeMenu),
				new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(scopeMenu),
			],
		});

		let type: string | null = null;
		let subtype: string | null = null;
		let scope: string | null = null;
		const pending = new Set(["event_type", "event_subtype", "event_scope"]);

		while (pending.size > 0) {
			const comp = await modalSubmit.channel!.awaitMessageComponent({
				filter: (i: StringSelectMenuInteraction) =>
					pending.has(i.customId) && i.user.id === interaction.user.id,
				componentType: ComponentType.StringSelect,
				time: 120_000,
			});

			const chosen = comp.values[0];
			if (comp.customId === "event_type") type = chosen;
			if (comp.customId === "event_subtype") subtype = chosen;
			if (comp.customId === "event_scope") scope = chosen;

			pending.delete(comp.customId);
			await comp.deferUpdate();
		}

		// --- Step 3: If VRC, ask for platforms + requirements ---
		let platforms: string[] = [];
		let requirements: string | null = null;

		if (type === "VRC") {
			const platformMenu = new StringSelectMenuBuilder()
				.setCustomId("event_platforms")
				.setPlaceholder("Choose platform(s)")
				.addOptions([
					{ label: "Android", value: "Android" },
					{ label: "PCVR", value: "PCVR" },
				])
				.setMinValues(1)
				.setMaxValues(2);

			const requirementsMenu = new StringSelectMenuBuilder()
				.setCustomId("event_requirements")
				.setPlaceholder("Choose avatar performance requirement")
				.addOptions(
					{ label: "No Restriction", value: "verypoor" },
					{ label: "Poor or better", value: "poor" },
					{ label: "Medium or better", value: "medium" },
					{ label: "Good or better", value: "good" },
					{ label: "Excellent", value: "excellent" }
				);

			await modalSubmit.followUp({
				content: "VRC options:",
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(platformMenu),
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(requirementsMenu),
				],
				flags: MessageFlags.Ephemeral,
			});

			const vrcPending = new Set(["event_platforms", "event_requirements"]);

			while (vrcPending.size > 0) {
				const comp = await modalSubmit.channel!.awaitMessageComponent({
					filter: (i: StringSelectMenuInteraction) =>
						vrcPending.has(i.customId) && i.user.id === interaction.user.id,
					componentType: ComponentType.StringSelect,
					time: 120_000,
				});

				if (comp.customId === "event_platforms") platforms = comp.values;
				if (comp.customId === "event_requirements") requirements = comp.values[0];

				vrcPending.delete(comp.customId);
				await comp.deferUpdate();
			}
		}

		// --- Step 4: Send "Set Timing" button ---
		await modalSubmit.followUp({
			content: "✅ Event basics captured. Now set the timing:",
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId("set_timing")
						.setLabel("⏰ Set Timing")
						.setStyle(ButtonStyle.Primary)
				),
			],
			flags: MessageFlags.Ephemeral,
		});

		const button = await modalSubmit.channel!.awaitMessageComponent({
			filter: (i) => i.customId === "set_timing" && i.user.id === interaction.user.id,
			componentType: ComponentType.Button,
			time: 120_000,
		});

		// --- Step 5: Timing modal ---
		const timingModal = new ModalBuilder()
			.setCustomId("event_timing_modal")
			.setTitle("Event Timing")
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder()
						.setCustomId("start")
						.setLabel("When does it start? (e.g. 'tomorrow 8pm')")
						.setStyle(TextInputStyle.Short)
						.setRequired(true)
				),
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder()
						.setCustomId("length")
						.setLabel("Length in minutes")
						.setStyle(TextInputStyle.Short)
						.setRequired(false)
				)
			);

		await button.showModal(timingModal);

		const timingSubmit = await button.awaitModalSubmit({
			filter: (i) => i.customId === "event_timing_modal" && i.user.id === interaction.user.id,
			time: 120_000,
		});
		await timingSubmit.deferReply({ flags: MessageFlags.Ephemeral });

		const startText = timingSubmit.fields.getTextInputValue("start");
		const lengthStr = timingSubmit.fields.getTextInputValue("length");

		const startDate = chrono.parseDate(startText);
		if (!startDate) {
			await timingSubmit.editReply({ content: "❌ Could not parse that date/time." });
			return;
		}

		const startTime = startDate;
		let lengthMinutes = parseInt(lengthStr, 10) ?? 0;
		if(Number.isNaN(lengthMinutes)) lengthMinutes = 0;

		// --- Step 6: Ask for poster upload ---
		await timingSubmit.followUp({
			content: "📌 If you’d like to add a poster image, please upload it in this channel now (you have 60 seconds). Otherwise, ignore this message.",
			flags: MessageFlags.Ephemeral,
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
			if (attachment && attachment.contentType?.startsWith("image/")) {
				posterUrl = attachment.url;
			}
		}


		// --- Step 7: Create thread + segmented embed ---
		const thread = await channel.threads.create({
			name: `Draft: ${title}`,
			autoArchiveDuration: 1440, // 24h
		});

		// Put all mutable fields into one object
		let eventData = {
			title,
			description,
			type,
			subtype,
			activity,
			scope,
			platforms,
			requirements,
			capacityCap,
			startTime,
			lengthMinutes,
			posterUrl,
		};

		// Helper to build segmented embed
		const buildEmbed = () => ({
			title: "📅 Event Draft",
			color: 0x5865F2,
			image: eventData.posterUrl ? { url: eventData.posterUrl } : undefined,
			fields: [
				{
					name: "Segment 1: Event Info",
					value: `**Title:** ${eventData.title}\n`,
				},
				{
					name: "",
					value: `**Description:** ${eventData.description || "None"}\n`,
				},
				{
					name: "",
					value: `**Host:** <@${interaction.user.id}>`,
				},
				{
					name: "Segment 2: Event Types",
					value: `**Type:** ${eventData.type}\n**Subtype:** ${eventData.subtype}\n**activity:** ${eventData.activity || "None"}\n**Scope:** ${eventData.scope}`,
				},
				{
					name: "Segment 3: Event Technical Reqs",
					value: `**Platforms:** ${eventData.platforms?.length ? eventData.platforms.join(", ") : "None"}\n**Requirements:** ${eventData.requirements || "None"}\n**Capacity:** ${eventData.capacityCap})`,
				},
				{
					name: "Segment 4: Event Timings",
					value: `**Start:** <t:${Math.floor(eventData.startTime.getTime() / 1000)}:F>\n**Length:** ${eventData.lengthMinutes ? `${eventData.lengthMinutes} minutes` : "Not set"
						}`,
				},
			],
		});

		// Buttons per segment
		const components = [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId("edit_title").setLabel("✏️ Edit Title").setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId("edit_description").setLabel("📝 Edit Description").setStyle(ButtonStyle.Secondary)
			),
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId("edit_type").setLabel("🎭 Edit Type").setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId("edit_subtype").setLabel("🎭 Edit Subtype").setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId("edit_activity").setLabel("🎮 Edit Activity").setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId("edit_scope").setLabel("🌍 Edit Scope").setStyle(ButtonStyle.Secondary)
			),
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId("edit_platforms").setLabel("🖥 Edit Platforms").setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId("edit_requirements").setLabel("⚙️ Edit Requirements").setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId("edit_capacity").setLabel("👥 Edit Capacity").setStyle(ButtonStyle.Secondary)
			),
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId("edit_start").setLabel("⏰ Edit Start Time").setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId("edit_length").setLabel("⏳ Edit Length").setStyle(ButtonStyle.Secondary)
			),
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId("get_event_id").setLabel("🔑 Get Event ID").setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId("publish_event").setLabel("🚀 Publish Event").setStyle(ButtonStyle.Success)
			),
		];

		const sent = await thread.send({ embeds: [buildEmbed()], components });

		// --- Step 8: Save to DB --- 
		const createdEvent = await prisma.event.create({
			data: {
				guildId: interaction.guildId!,
				draftChannelId: interaction.channelId,
				draftThreadMessageId: sent.id,
				draftThreadId: thread.id,
				hostId: interaction.user.id,
				title: eventData.title,
				type: eventData.type!,
				subtype: eventData.subtype!,
				capacityBase: 0,
				capacityCap: eventData.capacityCap,
				startTime: eventData.startTime,
				lengthMinutes: eventData.lengthMinutes ?? 0,
				published: false,
				...(eventData.activity ? { activity: eventData.activity } : {}),
				...(eventData.type === "VRC" && eventData.platforms.length ? { platforms: JSON.stringify(eventData.platforms) } : {}),
				...(eventData.type === "VRC" && eventData.requirements ? { requirements: eventData.requirements } : {}),
				...(eventData.description ? { description: eventData.description } : {}),
				...(eventData.scope ? { scope: eventData.scope } : {}),
				...(eventData.posterUrl ? { imageUrl: eventData.posterUrl } : {}),
			},
		});

		// --- Step 9: Confirm to user ---
		await timingSubmit.editReply({
			content: `✅ Event draft created in thread <#${thread.id}>`,
		});

		const canPublish = userHasAllowedRole(interaction.member as GuildMember, getStandardRolesOrganizer());
		// --- Step 10: Collector for edit buttons ---
		const collector = sent.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 600_000,
		});

		collector.on("collect", async (i) => {
			if (i.user.id !== interaction.user.id) {
				return i.reply({ content: "Only the host can edit this draft.", flags: MessageFlags.Ephemeral });
			}

			// Show modals or select menus depending on field
			if (i.customId === "edit_title") {
				const modal = new ModalBuilder()
					.setCustomId("modal_edit_title")
					.setTitle("Edit Title")
					.addComponents(
						new ActionRowBuilder<TextInputBuilder>().addComponents(
							new TextInputBuilder().setCustomId("new_title").setLabel("New Title").setStyle(TextInputStyle.Short).setRequired(true)
						)
					);
				return i.showModal(modal);
			}
			if (i.customId === "edit_description") {
				const modal = new ModalBuilder()
					.setCustomId("modal_edit_description")
					.setTitle("Edit Description")
					.addComponents(
						new ActionRowBuilder<TextInputBuilder>().addComponents(
							new TextInputBuilder().setCustomId("new_description").setLabel("New Description").setStyle(TextInputStyle.Paragraph)
						)
					);
				return i.showModal(modal);
			}
			if (i.customId === "edit_activity") {
				const modal = new ModalBuilder()
					.setCustomId("modal_edit_activity")
					.setTitle("Edit activity")
					.addComponents(
						new ActionRowBuilder<TextInputBuilder>().addComponents(
							new TextInputBuilder().setCustomId("new_activity").setLabel("Activity").setStyle(TextInputStyle.Short)
						)
					);
				return i.showModal(modal);
			}
			if (i.customId === "edit_capacity") {
				const modal = new ModalBuilder()
					.setCustomId("modal_edit_capacity")
					.setTitle("Edit Capacity")
					.addComponents(
						new ActionRowBuilder<TextInputBuilder>().addComponents(
							new TextInputBuilder().setCustomId("new_capacity_base").setLabel("Base Capacity").setStyle(TextInputStyle.Short).setRequired(true)
						),
						new ActionRowBuilder<TextInputBuilder>().addComponents(
							new TextInputBuilder().setCustomId("new_capacity_cap").setLabel("Max Capacity").setStyle(TextInputStyle.Short).setRequired(true)
						)
					);
				return i.showModal(modal);
			}
			if (i.customId === "edit_start") {
				const modal = new ModalBuilder()
					.setCustomId("modal_edit_start")
					.setTitle("Edit Start Time")
					.addComponents(
						new ActionRowBuilder<TextInputBuilder>().addComponents(
							new TextInputBuilder().setCustomId("new_start").setLabel("When does it start?").setStyle(TextInputStyle.Short).setRequired(true)
						)
					);
				return i.showModal(modal);
			}
			if (i.customId === "edit_length") {
				const modal = new ModalBuilder()
					.setCustomId("modal_edit_length")
					.setTitle("Edit Length")
					.addComponents(
						new ActionRowBuilder<TextInputBuilder>().addComponents(
							new TextInputBuilder().setCustomId("new_length").setLabel("Length in minutes").setStyle(TextInputStyle.Short)
						)
					);
				return i.showModal(modal);
			}

			// For type/subtype/scope/platforms/requirements, reply with select menus
			if (i.customId === "edit_type") {
				return i.reply({
					content: "Select a new type:",
					components: [
						new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
							new StringSelectMenuBuilder()
								.setCustomId("select_type")
								.setPlaceholder("Choose type")
								.addOptions([{ label: "VRC", value: "VRC" }, { label: "Discord", value: "Discord" }])
						),
					],
					flags: MessageFlags.Ephemeral,
				});
			}
			if (i.customId === "edit_subtype") {
				return i.reply({
					content: "Select a new subtype:",
					components: [
						new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
							new StringSelectMenuBuilder()
								.setCustomId("select_subtype")
								.setPlaceholder("Choose subtype")
								.addOptions(
									{ label: "Gaming", value: "Gaming" },
									{ label: "Social", value: "Social" },
									{ label: "Cinema", value: "Cinema" }
								)
						),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			if (i.customId === "edit_scope") {
				return i.reply({
					content: "Select a new scope:",
					components: [
						new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
							new StringSelectMenuBuilder()
								.setCustomId("select_scope")
								.setPlaceholder("Choose scope")
								.addOptions(
									{ label: "Group Only", value: "Group" },
									{ label: "Friends Can Join", value: "Friends" }
								)
						),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			if (i.customId === "edit_platforms") {
				return i.reply({
					content: "Select new platforms:",
					components: [
						new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
							new StringSelectMenuBuilder()
								.setCustomId("select_platforms")
								.setPlaceholder("Choose platform(s)")
								.setMinValues(1)
								.setMaxValues(2)
								.addOptions(
									{ label: "PCVR", value: "PCVR" },
									{ label: "Android", value: "Android" }
								)
						),
					],
					flags: MessageFlags.Ephemeral,
				});
			}

			if (i.customId === "edit_requirements") {
				return i.reply({
					content: "Select new requirements:",
					components: [
						new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
							new StringSelectMenuBuilder()
								.setCustomId("select_requirements")
								.setPlaceholder("Choose avatar performance requirement")
								.addOptions(
											{ label: "No Restriction", value: "verypoor" },
											{ label: "Poor or better", value: "poor" },
											{ label: "Medium or better", value: "medium" },
											{ label: "Good or better", value: "good" },
											{ label: "Excellent", value: "excellent" }
								)
						),
					],
					flags: MessageFlags.Ephemeral,
				});
			}
			if (i.customId === "get_event_id") {
				return i.reply({
					content: `This event's ID is: \`${createdEvent.id}\``, flags: MessageFlags.Ephemeral,
				});
			}

			if (i.customId === "publish_event" && canPublish) {
				// Only allow the host to publish
				if (i.user.id !== interaction.user.id) {
					return i.reply({
						content: "❌ Only the host can publish this event.", flags: MessageFlags.Ephemeral,
					});
				}

				try {
					await publishEvent(interaction.client, interaction.guild as Guild, createdEvent.id);
					await i.reply({
						content: `✅ Event published successfully!`,
						flags: MessageFlags.Ephemeral,
					});
				} catch (err) {
					console.error("Error publishing event:", err);
					await i.reply({
						content: "⚠️ Something went wrong while publishing.",
						flags: MessageFlags.Ephemeral,
					});
				}
			}
		}); // end collector.on
		interaction.client.on("interactionCreate", async (modalI) => {
			// --- Modal submissions ---
			if (modalI.isModalSubmit()) {
				if (modalI.customId === "modal_edit_title") {
					eventData.title = modalI.fields.getTextInputValue("new_title");
					await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { title: eventData.title } });
				}
				if (modalI.customId === "modal_edit_description") {
					eventData.description = modalI.fields.getTextInputValue("new_description");
					await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { description: eventData.description } });
				}
				if (modalI.customId === "modal_edit_activity") {
					eventData.activity = modalI.fields.getTextInputValue("new_activity");
					await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { activity: eventData.activity } });
				}
				if (modalI.customId === "modal_edit_capacity") {
					eventData.capacityCap = parseInt(modalI.fields.getTextInputValue("new_capacity_cap"), 10);
					if(Number.isNaN(eventData.capacityCap)) eventData.capacityCap = 0;
					await prisma.event.update({
						where: { draftThreadMessageId: sent.id },
						data: { capacityCap: eventData.capacityCap },
					});
				}
				if (modalI.customId === "modal_edit_start") {
					const chrono = await import("chrono-node");
					const parsed = chrono.parseDate(modalI.fields.getTextInputValue("new_start"));
					if (parsed) {
						eventData.startTime = parsed;
						await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { startTime: eventData.startTime } });
					}
				}
				if (modalI.customId === "modal_edit_length") {
					const val = modalI.fields.getTextInputValue("new_length");
					eventData.lengthMinutes = val ? parseInt(val, 10) : 0;
					if(Number.isNaN(eventData.lengthMinutes)) eventData.lengthMinutes = 0;
					await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { lengthMinutes: eventData.lengthMinutes } });
				}

				await modalI.reply({ content: "✅ Updated!", flags: MessageFlags.Ephemeral });
				await sent.edit({ embeds: [buildEmbed()], components });
			}

			// --- Select menu submissions ---
			if (modalI.isStringSelectMenu()) {
				if (modalI.customId === "select_type") {
					eventData.type = modalI.values[0];
					await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { type: eventData.type } });
				}
				if (modalI.customId === "select_subtype") {
					eventData.subtype = modalI.values[0];
					await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { subtype: eventData.subtype } });
				}
				if (modalI.customId === "select_scope") {
					eventData.scope = modalI.values[0];
					await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { scope: eventData.scope } });
				}
				if (modalI.customId === "select_platforms") {
					eventData.platforms = modalI.values;
					await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { platforms: JSON.stringify(eventData.platforms) } });
				}
				if (modalI.customId === "select_requirements") {
					eventData.requirements = modalI.values[0];
					await prisma.event.update({ where: { draftThreadMessageId: sent.id }, data: { requirements: eventData.requirements } });
				}

				await modalI.update({ content: "✅ Updated!", components: [] });
				await sent.edit({ embeds: [buildEmbed()], components });
			}
		}); // end interactionCreate listener
	}, // end execute
}; // end module.exports
