import {
	Events,
	Interaction,
	ButtonInteraction,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	ChannelType,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	VoiceChannel,
	MessageFlags,
	GuildMember,
	Routes,
} from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { refreshEventMessages } from "../helpers/refreshEventMessages";
import { refreshPublishedCalender } from "../helpers/refreshPublishedCalender";
import { ensureUserReminderDefaults } from '../helpers/generalHelpers';
import { buildCalenderContainer } from '../helpers/buildCalenderEmbed';
import { writeLog } from '../helpers/logger';
import { track, TrackedInteraction } from "../utils/interactionSystem";

const prisma = new PrismaClient();

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction: Interaction) {
		writeLog(`Interaction received: ${interaction.id} of type ${interaction.type}`);
		const ix = track(interaction, "interactionCreate");
		if (interaction.isButton()) {
			// Handle an event signup button
			if (interaction.customId.startsWith('ev:')) {
				await handleEventButtons(ix); // <- your handler
				return;
			}

			if (interaction.customId.startsWith('calendar:')) {
				await handleCalenderButtons(ix); // <- your handler
				return;
			}

			// Handle edit voice channel button
			if (interaction.customId.startsWith('edit_voice_')) {
				const channelId = interaction.customId.split('_')[2];
				const channel = interaction.guild?.channels.cache.get(channelId);

				if (!channel || channel.type !== ChannelType.GuildVoice) {
					await interaction.reply({ content: 'Channel not found or is not a voice channel.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Check if user is the room owner
				const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
					where: { channelId: channelId }
				});

				if (!tempChannel || tempChannel.createdBy !== interaction.user.id) {
					await interaction.reply({ content: 'Only the room owner can edit the voice channel.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Extract the current name without "VC | " prefix
				const currentName = channel.name.startsWith('VC | ')
					? channel.name.substring(5) // Remove "VC | " prefix
					: channel.name;

				// Create the modal
				const modal = new ModalBuilder()
					.setCustomId(`edit_voice_modal_${channelId}`)
					.setTitle('Edit voicechannel');

				const nameInput = new TextInputBuilder()
					.setCustomId('voice_name')
					.setLabel('Name * (without "VC |" prefix)')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('Enter channel name')
					.setValue(currentName)
					.setRequired(true)
					.setMaxLength(50);

				const userLimitInput = new TextInputBuilder()
					.setCustomId('voice_user_limit')
					.setLabel('User limit 0-99 (0 is infinite) *')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('0')
					.setValue(channel.userLimit?.toString() || '0')
					.setRequired(true)
					.setMaxLength(2);

				const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
				const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(userLimitInput);

				modal.addComponents(firstActionRow, secondActionRow);

				await interaction.showModal(modal);
			}

			// Handle kick user button
			if (interaction.customId.startsWith('kick_user_')) {
				const channelId = interaction.customId.split('_')[2];
				const channel = interaction.guild?.channels.cache.get(channelId);

				if (!channel || channel.type !== ChannelType.GuildVoice) {
					await interaction.reply({ content: 'Channel not found or is not a voice channel.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Check if user is the room owner
				const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
					where: { channelId: channelId }
				});

				if (!tempChannel || tempChannel.createdBy !== interaction.user.id) {
					await interaction.reply({ content: 'Only the room owner can kick users.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Get users in the voice channel
				const members = channel.members.filter(member => member.id !== interaction.user.id);

				if (members.size === 0) {
					await interaction.reply({ content: 'No users to kick from the voice channel.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Create select menu for users
				const selectMenu = new StringSelectMenuBuilder()
					.setCustomId(`kick_select_${channelId}`)
					.setPlaceholder('Select a user to kick')
					.setMinValues(1)
					.setMaxValues(1);

				members.forEach(member => {
					selectMenu.addOptions(
						new StringSelectMenuOptionBuilder()
							.setLabel(member.user.username)
							.setDescription(`Kick ${member.user.username} from the voice channel`)
							.setValue(member.id)
							.setEmoji('👢')
					);
				});

				const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

				await interaction.reply({ content: 'Select a user to kick from the voice channel:', components: [row], flags: MessageFlags.Ephemeral });
			}

			// Handle ban user button
			if (interaction.customId.startsWith('ban_user_')) {
				const channelId = interaction.customId.split('_')[2];
				const channel = interaction.guild?.channels.cache.get(channelId);

				if (!channel || channel.type !== ChannelType.GuildVoice) {
					await interaction.reply({ content: 'Channel not found or is not a voice channel.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Check if user is the room owner
				const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
					where: { channelId: channelId }
				});

				if (!tempChannel || tempChannel.createdBy !== interaction.user.id) {
					await interaction.reply({ content: 'Only the room owner can ban users.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Get users in the voice channel
				const members = channel.members.filter(member => member.id !== interaction.user.id);

				if (members.size === 0) {
					await interaction.reply({ content: 'No users to ban from the voice channel.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Create select menu for users
				const selectMenu = new StringSelectMenuBuilder()
					.setCustomId(`ban_select_${channelId}`)
					.setPlaceholder('Select a user to ban')
					.setMinValues(1)
					.setMaxValues(1);

				members.forEach(member => {
					selectMenu.addOptions(
						new StringSelectMenuOptionBuilder()
							.setLabel(member.user.username)
							.setDescription(`Ban ${member.user.username} from the voice channel`)
							.setValue(member.id)
							.setEmoji('🔨')
					);
				});

				const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

				await interaction.reply({ content: 'Select a user to ban from the voice channel:', components: [row], flags: MessageFlags.Ephemeral });
			}
		}

		if (interaction.isStringSelectMenu()) {
			// Handle kick user selection
			if (interaction.customId.startsWith('kick_select_')) {
				const channelId = interaction.customId.split('_')[2];
				const userId = interaction.values[0];
				const channel = interaction.guild?.channels.cache.get(channelId);
				const member = interaction.guild?.members.cache.get(userId);

				if (!channel || !member) {
					await interaction.reply({ content: 'User or channel not found.', flags: MessageFlags.Ephemeral });
					return;
				}

				try {
					await member.voice.disconnect();
					await interaction.reply({ content: `Successfully kicked ${member.user.username} from the voice channel.`, flags: MessageFlags.Ephemeral });
				} catch (error) {
					console.error('Error kicking user:', error);
					await interaction.reply({ content: 'Failed to kick user from voice channel.', flags: MessageFlags.Ephemeral });
				}
			}

			// Handle ban user selection
			if (interaction.customId.startsWith('ban_select_')) {
				const channelId = interaction.customId.split('_')[2];
				const userId = interaction.values[0];
				const channel = interaction.guild?.channels.cache.get(channelId);
				const member = interaction.guild?.members.cache.get(userId);

				if (!channel || !member) {
					await interaction.reply({ content: 'User or channel not found.', flags: MessageFlags.Ephemeral });
					return;
				}

				try {
					// Disconnect user from voice
					await member.voice.disconnect();

					// Add permission override to prevent them from rejoining
					await (channel as VoiceChannel).permissionOverwrites.create(member, {
						Connect: false
					});

					await interaction.reply({ content: `Successfully banned ${member.user.username} from the voice channel.`, flags: MessageFlags.Ephemeral });
				} catch (error) {
					console.error('Error banning user:', error);
					await interaction.reply({ content: 'Failed to ban user from voice channel.', flags: MessageFlags.Ephemeral });
				}
			}
		}

		if (interaction.isModalSubmit()) {
			// Handle edit voice channel modal submission
			if (interaction.customId.startsWith('edit_voice_modal_')) {
				const channelId = interaction.customId.split('_')[3];
				const channel = interaction.guild?.channels.cache.get(channelId);

				if (!channel || channel.type !== ChannelType.GuildVoice) {
					await interaction.reply({ content: 'Channel not found or is not a voice channel.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Check if user is the room owner
				const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
					where: { channelId: channelId }
				});

				if (!tempChannel || tempChannel.createdBy !== interaction.user.id) {
					await interaction.reply({ content: 'Only the room owner can edit the voice channel.', flags: MessageFlags.Ephemeral });
					return;
				}

				const nameInput = interaction.fields.getTextInputValue('voice_name');
				const userLimit = parseInt(interaction.fields.getTextInputValue('voice_user_limit'));

				// Validate inputs
				if (userLimit < 0 || userLimit > 99) {
					await interaction.reply({ content: 'User limit must be between 0 and 99.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Ensure the name always has "VC | " prefix
				const finalName = nameInput.startsWith('VC | ')
					? nameInput
					: `VC | ${nameInput}`;

				try {
					await channel.edit({
						name: finalName,
						userLimit: userLimit
					});

					await interaction.reply({ content: 'Voice channel updated successfully!', flags: MessageFlags.Ephemeral });
				} catch (error) {
					console.error('Error updating voice channel:', error);
					await interaction.reply({ content: 'Failed to update voice channel.', flags: MessageFlags.Ephemeral });
				}
			}
		}

		// Handle slash commands
		if (interaction.isChatInputCommand()) {
			const command = (interaction.client as any).commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.execute(ix);
			} catch (error) {
				console.error(error);
				await ix.reply(
					{ content: "There was an error while executing this interaction!", flags: MessageFlags.Ephemeral },
					{ tag: "top-level-error" }
				);
			} finally {
				ix.dispose();
			}
		}
	},
};

export async function handleCalenderButtons(ix: TrackedInteraction) {
	if (!ix.interaction.isButton()) return;

	const bi = ix.interaction; // ButtonInteraction
	try {
		const now = new Date(Date.now() - 2 * 60 * 60 * 1000);
		const guildId = bi.guildId as string;
		const userId = bi.user.id as string;

		const events = await prisma.event.findMany({
			where: {
				guildId,
				startTime: { gte: now },
				published: true,
				signups: { some: { userId } },
			},
			orderBy: { startTime: "asc" },
			include: { _count: { select: { signups: true } } },
		});

		if (events.length === 0) {
			await ix.reply({ content: "ℹ️ No upcoming events.", flags: MessageFlags.Ephemeral }, { tag: "calendar-empty" });
			return;
		}

		const container = buildCalenderContainer(events, guildId, true, true);
		await ix.reply(container, { tag: "calendar-my-events" });
	} catch (err) {
		console.error("Button handler error:", err);
		await ix.reply(
			{ content: "❌ Something went wrong. Please try again.", flags: MessageFlags.Ephemeral },
			{ tag: "calendar-error" }
		);
	}
}


// map action -> prisma client + shape
type ActionKind = "attend" | "interest" | "cohost";

export async function handleEventButtons(ix: TrackedInteraction) {
	if (!ix.interaction.isButton()) return;

	const interaction = ix.interaction; // ButtonInteraction
	const m = interaction.customId.match(/^ev:(\d+):(attend|interest|cohost):(on|off)$/);
	if (!m) return;

	const [, eventIdStr, action, op] = m;
	const eventId = Number(eventIdStr);
	const userId = interaction.user.id;

	try {
		await ix.deferUpdate({ tag: "ev-deferUpdate" });

		switch (action as ActionKind) {
			case "attend": {
				const guildId = interaction.guildId as string;

				const event = await prisma.event.findUnique({ where: { id: eventId } });
				if (!event || !event.publishedThreadId) {
					console.warn("Event or publishedThreadId not found");
					return;
				}

				const thread = await interaction.client.channels.fetch(event.publishedThreadId);
				if (!thread || (thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread)) {
					console.warn("Channel is not a thread");
					return;
				}

				if (op === "on") {
					const existing = await prisma.eventSignUps.findFirst({ where: { eventId: event.id, userId } });
					if (!existing) await prisma.eventSignUps.create({ data: { eventId: event.id, userId } });

					await ensureUserReminderDefaults(userId);
					await refreshPublishedCalender(interaction.client, guildId, false);
					await (thread as any).members.add(userId);
				} else {
					await prisma.eventSignUps.deleteMany({ where: { eventId: event.id, userId } });

					await refreshPublishedCalender(interaction.client, guildId, false);
					await (thread as any).members.remove(userId);
				}
			}
		}

		await refreshEventMessages(interaction.client, eventId);
	} catch (err) {
		console.error("Button handler error:", err);

		// for component interactions after deferUpdate, followUp is safe
		await ix.followUp(
			{ content: "❌ Something went wrong. Please try again.", flags: MessageFlags.Ephemeral },
			{ tag: "ev-error" }
		);
	}
}
