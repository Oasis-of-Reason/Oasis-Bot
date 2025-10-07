import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, GuildMember } from "discord.js";
import { prisma } from "../utils/prisma";
import { userHasAllowedRole } from "./securityHelpers";
import { publishEvent } from "./publishEvent";

export async function reinitialiseDraftEvents(client: Client) {
	try {
		// Fetch all active events from the database
		const activeEvents = await prisma.event.findMany({
			where: {
				published: false, // Assuming you only want to re-initialize drafts
			},
		});

		// Loop through each active event
		for (const event of activeEvents) {
			// Fetch the guild and channel
			const guild = await client.guilds.fetch(event.guildId);
			const channel = guild.channels.cache.get(event.draftChannelId) as TextChannel;
			const thread = await channel.threads.fetch(event.draftThreadId);

			if (!thread) {
				console.warn(`Thread not found for event ${event.id}`);
				continue;
			}

			// Fetch the message
			const message = await thread.messages.fetch(event.draftThreadMessageId);

			if (!message) {
				console.warn(`Message not found for event ${event.id}`);
				continue;
			}

			// Re-create the eventData object
			const eventData = {
				title: event.title,
				description: event.description,
				type: event.type,
				subtype: event.subtype,
				activity: event.activity,
				scope: event.scope,
				platforms: event.platforms ? JSON.parse(event.platforms) : [],
				requirements: event.requirements,
				capacityBase: event.capacityBase,
				capacityCap: event.capacityCap,
				startTime: event.startTime,
				lengthMinutes: event.lengthMinutes,
				posterUrl: event.imageUrl,
			};

			// Re-create the embed
			const buildEmbed = () => ({
				title: "📅 Event Draft",
				color: 0x5865F2,
				image: eventData.posterUrl ? { url: eventData.posterUrl } : undefined,
				fields: [
					{
						name: "Segment 1: Event Info",
						value: `**Title:** ${eventData.title}\n**Description:** ${eventData.description || "None"}\n**Host:** <@${event.hostId}>`,
					},
					{
						name: "Segment 2: Event Types",
						value: `**Type:** ${eventData.type}\n**Subtype:** ${eventData.subtype}\n**Activity:** ${eventData.activity || "None"}\n**Scope:** ${eventData.scope}`,
					},
					{
						name: "Segment 3: Event Technical Reqs",
						value: `**Platforms:** ${eventData.platforms?.length ? eventData.platforms.join(", ") : "None"}\n**Requirements:** ${eventData.requirements || "None"}\n**Capacity:** ${eventData.capacityCap})`,
					},
					{
						name: "Segment 4: Event Timings",
						value: `**Start:** <t:${Math.floor(eventData.startTime.getTime() / 1000)}:F>\n**Length:** ${eventData.lengthMinutes ? `${eventData.lengthMinutes} minutes` : "Not set"}`,
					},
				],
			});

			// Re-create the components
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

			// Update the message with the new embed and components
			await message.edit({ embeds: [buildEmbed()], components });

			// Re-create the message component collector
			const collector = message.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: 600_000,
			});

			collector.on("collect", async (i) => {
				if (i.user.id !== event.hostId) {
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
						.setTitle("Edit Activity")
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
										{ label: "No Restriction", value: ":VeryPoor: No Restriction" },
										{ label: "Poor or better", value: ":Poor: Poor or better" },
										{ label: "Medium or better", value: ":Medium: Medium or better" },
										{ label: "Good or better", value: ":Good: Good or better" },
										{ label: "Excellent", value: ":VeryGood: Excellent" }
									)
							),
						],
						flags: MessageFlags.Ephemeral,
					});
				}
				if (i.customId === "get_event_id") {
					return i.reply({
						content: `This event's ID is: \`${event.id}\``, flags: MessageFlags.Ephemeral,
					});
				}

				if (i.customId === "publish_event") {
					// Only allow the host to publish
					if (i.user.id !== event.hostId) {
						return i.reply({
							content: "❌ Only the host can publish this event.", flags: MessageFlags.Ephemeral,
						});
					}

					try {
						await publishEvent(client, guild, event.id);
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
		}
	} catch (error) {
		console.error("Error re-initializing events:", error);
	}
}