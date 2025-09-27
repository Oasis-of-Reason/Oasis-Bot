"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
module.exports = {
    name: discord_js_1.Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const { member, guild } = newState;
        if (!member || !guild)
            return;
        try {
            const guildConfig = await prisma.guildConfig.findUnique({
                where: { id: guild.id }
            });
            if (!guildConfig?.voiceCreatorRoomId || !guildConfig?.voiceCreatorCategory) {
                return;
            }
            if (newState.channelId === guildConfig.voiceCreatorRoomId) {
                try {
                    const channelName = `VC | ${member.user.username}'s Room`;
                    const newChannel = await guild.channels.create({
                        name: channelName,
                        type: discord_js_1.ChannelType.GuildVoice,
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
                    await member.voice.setChannel(newChannel);
                    await prisma.temporaryVoiceChannel.create({
                        data: {
                            channelId: newChannel.id,
                            guildId: guild.id,
                            createdBy: member.id
                        }
                    });
                    const embed = new discord_js_1.EmbedBuilder()
                        .setTitle('🎤 Your Personal Voice Room')
                        .setDescription(`Welcome to your temporary voice channel, ${member}! 🎉\n\nYou have full control over this room - feel free to customize the name and settings to your liking. This channel will automatically be cleaned up when everyone leaves.\n\n**Room Owner:** ${member}\n**Created:** <t:${Math.floor(Date.now() / 1000)}:R>`)
                        .setColor(0x00FF88)
                        .setThumbnail(member.user.displayAvatarURL())
                        .setFooter({ text: '💡 Use the buttons below to manage your room' })
                        .setTimestamp();
                    const row1 = new discord_js_1.ActionRowBuilder()
                        .addComponents(new discord_js_1.ButtonBuilder()
                        .setCustomId(`edit_voice_${newChannel.id}`)
                        .setLabel('Customize Room')
                        .setStyle(discord_js_1.ButtonStyle.Success)
                        .setEmoji('⚙️'));
                    const row2 = new discord_js_1.ActionRowBuilder()
                        .addComponents(new discord_js_1.ButtonBuilder()
                        .setCustomId(`kick_user_${newChannel.id}`)
                        .setLabel('Kick User')
                        .setStyle(discord_js_1.ButtonStyle.Danger)
                        .setEmoji('👢'), new discord_js_1.ButtonBuilder()
                        .setCustomId(`ban_user_${newChannel.id}`)
                        .setLabel('Ban User')
                        .setStyle(discord_js_1.ButtonStyle.Danger)
                        .setEmoji('🔨'));
                    await newChannel.send({ embeds: [embed], components: [row1, row2] });
                    console.log(`Created temporary voice channel: ${newChannel.name} for ${member.user.tag}`);
                }
                catch (error) {
                    console.error('Error creating temporary voice channel:', error);
                }
            }
            if (oldState.channelId) {
                const channelId = oldState.channelId;
                const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
                    where: { channelId: channelId }
                });
                if (tempChannel) {
                    const channel = guild.channels.cache.get(channelId);
                    if (channel && channel.type === discord_js_1.ChannelType.GuildVoice) {
                        if (channel.members.size === 0) {
                            setTimeout(async () => {
                                try {
                                    const updatedChannel = guild.channels.cache.get(channelId);
                                    if (updatedChannel && updatedChannel.type === discord_js_1.ChannelType.GuildVoice && updatedChannel.members.size === 0) {
                                        await updatedChannel.delete();
                                        await prisma.temporaryVoiceChannel.delete({
                                            where: { channelId: channelId }
                                        });
                                        console.log(`Deleted empty temporary voice channel: ${updatedChannel.name}`);
                                    }
                                }
                                catch (error) {
                                    console.error('Error deleting temporary voice channel:', error);
                                }
                            }, 30000);
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error('Error in voiceStateUpdate:', error);
        }
    },
};
