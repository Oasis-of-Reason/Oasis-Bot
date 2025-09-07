import { Events, VoiceState, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
	name: Events.VoiceStateUpdate,
	async execute(oldState: VoiceState, newState: VoiceState) {
		const { member, guild } = newState;
		if (!member || !guild) return;

		try {
			// Get guild configuration from database
			const guildConfig = await prisma.guildConfig.findUnique({
				where: { id: guild.id }
			});

			if (!guildConfig?.voiceCreatorRoomId || !guildConfig?.voiceCreatorCategory) {
				return; // Voice channel creator not configured for this guild
			}

			// Check if user joined the voice creator room
			if (newState.channelId === guildConfig.voiceCreatorRoomId) {
				try {
					// Create a new temporary voice channel with "VC |" prefix
					const channelName = `VC | ${member.user.username}'s Room`;
					const newChannel = await guild.channels.create({
						name: channelName,
						type: ChannelType.GuildVoice,
						parent: guildConfig.voiceCreatorCategory,
						permissionOverwrites: [
							{
								id: member.id,
								allow: ['Connect', 'Speak']
							},
							{
								id: guild.roles.everyone.id,
								allow: ['Connect', 'Speak']
							}
						]
					});

					// Move the user to the new channel
					await member.voice.setChannel(newChannel);

					// Store the temporary channel info in database
					await prisma.temporaryVoiceChannel.create({
						data: {
							channelId: newChannel.id,
							guildId: guild.id,
							createdBy: member.id
						}
					});

					// Send the edit message to the voice channel's chat
					const embed = new EmbedBuilder()
						.setTitle('🎤 Your Personal Voice Room')
						.setDescription(`Welcome to your temporary voice channel, ${member}! 🎉\n\nYou have full control over this room - feel free to customize the name and settings to your liking. This channel will automatically be cleaned up when everyone leaves.\n\n**Room Owner:** ${member}\n**Created:** <t:${Math.floor(Date.now() / 1000)}:R>`)
						.setColor(0x00FF88)
						.setThumbnail(member.user.displayAvatarURL())
						.setFooter({ text: '💡 Use the buttons below to manage your room' })
						.setTimestamp();

					const row1 = new ActionRowBuilder<ButtonBuilder>()
						.addComponents(
							new ButtonBuilder()
								.setCustomId(`edit_voice_${newChannel.id}`)
								.setLabel('Customize Room')
								.setStyle(ButtonStyle.Success)
								.setEmoji('⚙️')
						);

					const row2 = new ActionRowBuilder<ButtonBuilder>()
						.addComponents(
							new ButtonBuilder()
								.setCustomId(`kick_user_${newChannel.id}`)
								.setLabel('Kick User')
								.setStyle(ButtonStyle.Danger)
								.setEmoji('👢'),
							new ButtonBuilder()
								.setCustomId(`ban_user_${newChannel.id}`)
								.setLabel('Ban User')
								.setStyle(ButtonStyle.Danger)
								.setEmoji('🔨')
						);

					await newChannel.send({ embeds: [embed], components: [row1, row2] });

					console.log(`Created temporary voice channel: ${newChannel.name} for ${member.user.tag}`);
				} catch (error) {
					console.error('Error creating temporary voice channel:', error);
				}
			}

			// Check if user left a temporary channel
			if (oldState.channelId) {
				const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
					where: { channelId: oldState.channelId }
				});

				if (tempChannel) {
					const channel = guild.channels.cache.get(oldState.channelId);
					if (channel && channel.type === ChannelType.GuildVoice) {
						// Check if channel is empty
						if (channel.members.size === 0) {
							try {
								// Delete the voice channel (this will also delete its chat)
								await channel.delete();
								
								// Remove from database
								await prisma.temporaryVoiceChannel.delete({
									where: { channelId: oldState.channelId }
								});

								console.log(`Deleted empty temporary voice channel: ${channel.name}`);
							} catch (error) {
								console.error('Error deleting temporary voice channel:', error);
							}
						}
					}
				}
			}
		} catch (error) {
			console.error('Error in voiceStateUpdate:', error);
		}
	},
}; 