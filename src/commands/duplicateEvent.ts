// src/commands/DuplicateEvent.ts
import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	MessageFlags,
	TextChannel,
	ThreadChannel,
	GuildMember,
	ComponentType,
} from "discord.js";
import { prisma } from "../utils/prisma";
import {
	userHasAllowedRoleOrId,
	getStandardRolesOrganizer,
} from "../helpers/securityHelpers";
import { buildDraftEmbed, editButtons, handleDraftButton } from "../helpers/eventDraft";
import { updateThreadTitle } from "../helpers/refreshEventMessages";

module.exports = {
	data: new SlashCommandBuilder()
		.setName("duplicate-event")
		.setDescription("Duplicate an existing event into a new unpublished draft")
		.addNumberOption(opt =>
			opt.setName("id").setDescription("ID of the event to duplicate").setRequired(true)
		),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.guild) {
			await interaction.reply({
				content: "❌ This command can only be used in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const eventId = interaction.options.getNumber("id", true);
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		// Load the source event
		const src = await prisma.event.findUnique({ where: { id: eventId } });
		if (!src) {
			await interaction.editReply({ content: `❌ No event found with ID **${eventId}**.` });
			return;
		}

		// Permission: organizer OR original host
		const ok = userHasAllowedRoleOrId(
			interaction.member as GuildMember,
			getStandardRolesOrganizer(),
			[src.hostId]
		);
		if (!ok) {
			await interaction.editReply({ content: "❌ You don't have permission to duplicate this event." });
			return;
		}

		// Draft channel config
		const guildConfig = await prisma.guildConfig.findUnique({ where: { id: interaction.guildId! } });
		const draftChannelId = guildConfig?.draftChannelId;
		if (!draftChannelId) {
			await interaction.editReply({ content: "❌ No draft channel configured for this server." });
			return;
		}

		// Fetch draft channel
		const draftChannel = (await interaction.client.channels.fetch(draftChannelId).catch(() => null)) as TextChannel | null;
		if (!draftChannel) {
			await interaction.editReply({ content: "❌ Unable to access the draft channel." });
			return;
		}

		// Prepare duplicated data
		const title = `${src.title}`;
		const eventData = {
			title,
			description: src.description ?? null,
			activity: (src as any).activity ?? null,
			type: src.type,
			subtype: src.subtype,
			scope: src.scope ?? null,
			platforms: src.platforms ? ((): string[] => { try { return JSON.parse(src.platforms); } catch { return []; } })() : [],
			requirements: src.requirements ?? null,
			capacityCap: src.capacityCap,
			startTime: src.startTime,
			lengthMinutes: src.lengthMinutes ?? 0,
			posterUrl: src.imageUrl ?? null,
			hostId: interaction.user.id, // duplicator becomes the host; change to src.hostId if you want original host retained
		};

		const thread = await draftChannel.threads.create({
			name: `Draft: ${title}`,
			autoArchiveDuration: 1440,
		});

		// Create the new (unpublished) event in DB
		const duplicated = await prisma.event.create({
			data: {
				guildId: interaction.guildId!,
				draftChannelId: draftChannel.id,
				draftThreadId: thread.id,
				draftThreadMessageId: null,
				hostId: interaction.user.id, // or src.hostId to keep original host
				title: eventData.title,
				type: eventData.type,
				subtype: eventData.subtype,
				capacityBase: src.capacityBase ?? 0,
				capacityCap: eventData.capacityCap,
				startTime: eventData.startTime,
				lengthMinutes: eventData.lengthMinutes,
				published: false,
				
				// Optional fields copied
				lastTitleChangeTime: new Date(),
				...(eventData.activity ? { activity: eventData.activity } as any : {}),
				...(eventData.type === "VRC" && eventData.platforms?.length
					? { platforms: JSON.stringify(eventData.platforms) }
					: {}),
				...(eventData.type === "VRC" && eventData.requirements ? { requirements: eventData.requirements } : {}),
				...(eventData.description ? { description: eventData.description } : {}),
				...(eventData.scope ? { scope: eventData.scope } : {}),
				...(src.community ? { community: src.community } : {}),
				...(src.communityLink ? { communityLink: src.communityLink } : {}),
				...(src.rolePings ? { rolePings: src.rolePings } : {}),
				...(eventData.posterUrl ? { imageUrl: eventData.posterUrl } : {}),
			},
		});

		// Attach edit button handler (host-only)
		const hydrated = {
			id: duplicated.id,
			hostId: duplicated.hostId,
			title: duplicated.title,
			description: duplicated.description ?? "",
			activity: (duplicated as any).activity ?? null,
			type: duplicated.type,
			subtype: duplicated.subtype,
			scope: duplicated.scope ?? "",
			platforms: duplicated.platforms ?? "",
			requirements: duplicated.requirements ?? "",
			capacityCap: duplicated.capacityCap,
			startTime: duplicated.startTime,
			lengthMinutes: duplicated.lengthMinutes ?? 0,
			imageUrl: duplicated.imageUrl ?? "",
			vrcCalenderEventId: "",
			vrcSendNotification: duplicated.vrcSendNotification ?? false,
			vrcDescription: duplicated.vrcDescription ?? "",
			vrcImageId: duplicated.vrcImageId ?? "",
			vrcGroupId: duplicated.vrcGroupId ?? "",
		};

		const sent = await thread.send({
			embeds: [buildDraftEmbed(hydrated)],
			components: editButtons(),
		});
		// Update to fit new Thread name Style for drafts
		// Needs to update the new draft channel, not the location the interaction took place. 
		await updateThreadTitle(interaction.client, duplicated.draftThreadId, duplicated.title, hydrated.id)

		await prisma.event.update({
			where: { id: duplicated.id },
			data: { draftThreadMessageId: sent.id },
		});

		// Make sure the invoking user is added to the thread
		await thread.members.add(interaction.user.id).catch(() => { });

		const btnCollector = sent.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 0,
		});
		btnCollector.on("collect", async (i) => handleDraftButton(i, hydrated, sent));

		// Done
		await interaction.editReply({
			content: `✅ Duplicated event **#${eventId} → #${duplicated.id}**.\nDraft thread: <#${thread.id}>`,
		});
	},
};
