import {
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	EmbedBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	ButtonStyle,
	ComponentType,
	User,
	MessageFlags
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { getStandardRolesOrganizer } from "../helpers/securityHelpers";
import { TrackedInteraction } from "../utils/interactionSystem";
const prisma = new PrismaClient();

export const data = new SlashCommandBuilder()
	.setName("list-my-drafts")
	.setDescription("List your event drafts or drafts from another host")
	.addUserOption(option =>
		option
			.setName("host")
			.setDescription("Show drafts for another host")
			.setRequired(false)
	)
	.addStringOption(option =>
		option
			.setName("search")
			.setDescription("Fuzzy search for events by title")
			.setRequired(false)
	);

export async function execute(ix: TrackedInteraction) {
	const guild = ix.interaction.guild;
	if (!guild) {
		return ix.reply({
			content: "This command must be used inside a server.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const interaction = ix.interaction as ChatInputCommandInteraction;
	const hostUser: User | null = interaction.options.getUser("host");
	const search = interaction.options.getString("search");

	const requestingUserId = ix.interaction.user.id;
	const targetHostId = hostUser ? hostUser.id : requestingUserId;


	// 🔒 Permission check if requesting drafts of another user
	if (hostUser && hostUser.id !== requestingUserId) {
		const rolesAllowed = getStandardRolesOrganizer();

		// Narrow to GuildMember
		if (!ix.interaction.member || !("roles" in ix.interaction.member)) {
			return ix.reply({
				content: "Could not determine your permissions.",
				flags: MessageFlags.Ephemeral,
			});
		}

		const member = ix.interaction.member as import("discord.js").GuildMember;

		const hasPermission = member.roles.cache.some(role =>
			rolesAllowed.includes(role.name)
		);

		if (!hasPermission) {
			return ix.reply({
				content: "Sorry, you do not have permission to run this command.",
				flags: MessageFlags.Ephemeral,
			});
		}
	}

	// 📦 Prisma query
	const events = await prisma.event.findMany({
		where: {
			hostId: targetHostId,
			...(search
				? {
					title: {
						contains: search,
					},
				}
				: {}),
		},
		orderBy: {
			createdAt: "desc",
		},
	});


	// 🔢 Pagination
	const pageSize = 10;
	const totalPages = Math.ceil(events.length / pageSize);
	let currentPage = 0;

	const buildPageEmbed = (page: number) => {
		const start = page * pageSize;
		const end = start + pageSize;
		const pageEvents = events.slice(start, end);

		const embed = new EmbedBuilder()
			.setTitle(
				hostUser
					? `Draft Events for ${hostUser.username}`
					: "Your Draft Events"
			)
			.setFooter({
				text: `Page ${page + 1} of ${totalPages} • Total: ${events.length}`,
			})
			.setColor(0x00aeff);

		for (const e of pageEvents) {
			const url = `https://discord.com/channels/${e.guildId}/${e.draftThreadId}/${e.draftThreadMessageId}`;
			embed.addFields({
				name: '',  // invisible placeholder
				value: `[${e.id} - ${e.title}](${url})`,
				inline: false
			});
		}

		return embed;
	};

	const buildButtons = (page: number) => {
		return new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("first")
				.setLabel("⏮️")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(page === 0),

			new ButtonBuilder()
				.setCustomId("prev")
				.setLabel("◀️")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(page === 0),

			new ButtonBuilder()
				.setCustomId("next")
				.setLabel("▶️")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(page >= totalPages - 1),

			new ButtonBuilder()
				.setCustomId("last")
				.setLabel("⏭️")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(page >= totalPages - 1)
		);
	};

	// Send first page
	await ix.reply({
		embeds: [buildPageEmbed(currentPage)],
		components: [buildButtons(currentPage)],
		flags: MessageFlags.Ephemeral,
	});
	
	// Collector
	const collector = ix.interaction.channel?.createMessageComponentCollector({
		componentType: ComponentType.Button,
		time: 60000, // 60 seconds
		filter: (i) => i.user.id === ix.interaction.user.id && i.message.interaction?.id === ix.interaction.id,
	});

	if (!collector) return;

	collector.on("collect", async btnInt => {
		if (btnInt.user.id !== ix.interaction.user.id) {
			return btnInt.reply({
				content: "You cannot control another user's pagination.",
				flags: MessageFlags.Ephemeral,
			});
		}

		switch (btnInt.customId) {
			case "first":
				currentPage = 0;
				break;
			case "prev":
				currentPage = Math.max(0, currentPage - 1);
				break;
			case "next":
				currentPage = Math.min(totalPages - 1, currentPage + 1);
				break;
			case "last":
				currentPage = totalPages - 1;
				break;
		}

		await btnInt.update({
			embeds: [buildPageEmbed(currentPage)],
			components: [buildButtons(currentPage)],
		});
	});

	collector.on("end", async () => {
		// Disable buttons when collector stops
		try {
			await (ix.interaction as ChatInputCommandInteraction).editReply({
				components: [],
			});
		} catch (e) {
			// Interaction already responded or expired
		}
	});
}
