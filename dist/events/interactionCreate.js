"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
module.exports = {
    name: discord_js_1.Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('edit_voice_')) {
                const channelId = interaction.customId.split('_')[2];
                const channel = interaction.guild?.channels.cache.get(channelId);
                if (!channel || channel.type !== discord_js_1.ChannelType.GuildVoice) {
                    await interaction.reply({ content: 'Channel not found or is not a voice channel.', ephemeral: true });
                    return;
                }
                const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
                    where: { channelId: channelId }
                });
                if (!tempChannel || tempChannel.createdBy !== interaction.user.id) {
                    await interaction.reply({ content: 'Only the room owner can edit the voice channel.', ephemeral: true });
                    return;
                }
                const currentName = channel.name.startsWith('VC | ')
                    ? channel.name.substring(5)
                    : channel.name;
                const modal = new discord_js_1.ModalBuilder()
                    .setCustomId(`edit_voice_modal_${channelId}`)
                    .setTitle('Edit voicechannel');
                const nameInput = new discord_js_1.TextInputBuilder()
                    .setCustomId('voice_name')
                    .setLabel('Name * (without "VC |" prefix)')
                    .setStyle(discord_js_1.TextInputStyle.Short)
                    .setPlaceholder('Enter channel name')
                    .setValue(currentName)
                    .setRequired(true)
                    .setMaxLength(100);
                const userLimitInput = new discord_js_1.TextInputBuilder()
                    .setCustomId('voice_user_limit')
                    .setLabel('User limit 0-99 (0 is infinite) *')
                    .setStyle(discord_js_1.TextInputStyle.Short)
                    .setPlaceholder('0')
                    .setValue(channel.userLimit?.toString() || '0')
                    .setRequired(true)
                    .setMaxLength(2);
                const firstActionRow = new discord_js_1.ActionRowBuilder().addComponents(nameInput);
                const secondActionRow = new discord_js_1.ActionRowBuilder().addComponents(userLimitInput);
                modal.addComponents(firstActionRow, secondActionRow);
                await interaction.showModal(modal);
            }
            if (interaction.customId.startsWith('kick_user_')) {
                const channelId = interaction.customId.split('_')[2];
                const channel = interaction.guild?.channels.cache.get(channelId);
                if (!channel || channel.type !== discord_js_1.ChannelType.GuildVoice) {
                    await interaction.reply({ content: 'Channel not found or is not a voice channel.', ephemeral: true });
                    return;
                }
                const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
                    where: { channelId: channelId }
                });
                if (!tempChannel || tempChannel.createdBy !== interaction.user.id) {
                    await interaction.reply({ content: 'Only the room owner can kick users.', ephemeral: true });
                    return;
                }
                const members = channel.members.filter(member => member.id !== interaction.user.id);
                if (members.size === 0) {
                    await interaction.reply({ content: 'No users to kick from the voice channel.', ephemeral: true });
                    return;
                }
                const selectMenu = new discord_js_1.StringSelectMenuBuilder()
                    .setCustomId(`kick_select_${channelId}`)
                    .setPlaceholder('Select a user to kick')
                    .setMinValues(1)
                    .setMaxValues(1);
                members.forEach(member => {
                    selectMenu.addOptions(new discord_js_1.StringSelectMenuOptionBuilder()
                        .setLabel(member.user.username)
                        .setDescription(`Kick ${member.user.username} from the voice channel`)
                        .setValue(member.id)
                        .setEmoji('👢'));
                });
                const row = new discord_js_1.ActionRowBuilder().addComponents(selectMenu);
                await interaction.reply({ content: 'Select a user to kick from the voice channel:', components: [row], ephemeral: true });
            }
            if (interaction.customId.startsWith('ban_user_')) {
                const channelId = interaction.customId.split('_')[2];
                const channel = interaction.guild?.channels.cache.get(channelId);
                if (!channel || channel.type !== discord_js_1.ChannelType.GuildVoice) {
                    await interaction.reply({ content: 'Channel not found or is not a voice channel.', ephemeral: true });
                    return;
                }
                const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
                    where: { channelId: channelId }
                });
                if (!tempChannel || tempChannel.createdBy !== interaction.user.id) {
                    await interaction.reply({ content: 'Only the room owner can ban users.', ephemeral: true });
                    return;
                }
                const members = channel.members.filter(member => member.id !== interaction.user.id);
                if (members.size === 0) {
                    await interaction.reply({ content: 'No users to ban from the voice channel.', ephemeral: true });
                    return;
                }
                const selectMenu = new discord_js_1.StringSelectMenuBuilder()
                    .setCustomId(`ban_select_${channelId}`)
                    .setPlaceholder('Select a user to ban')
                    .setMinValues(1)
                    .setMaxValues(1);
                members.forEach(member => {
                    selectMenu.addOptions(new discord_js_1.StringSelectMenuOptionBuilder()
                        .setLabel(member.user.username)
                        .setDescription(`Ban ${member.user.username} from the voice channel`)
                        .setValue(member.id)
                        .setEmoji('🔨'));
                });
                const row = new discord_js_1.ActionRowBuilder().addComponents(selectMenu);
                await interaction.reply({ content: 'Select a user to ban from the voice channel:', components: [row], ephemeral: true });
            }
        }
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('kick_select_')) {
                const channelId = interaction.customId.split('_')[2];
                const userId = interaction.values[0];
                const channel = interaction.guild?.channels.cache.get(channelId);
                const member = interaction.guild?.members.cache.get(userId);
                if (!channel || !member) {
                    await interaction.reply({ content: 'User or channel not found.', ephemeral: true });
                    return;
                }
                try {
                    await member.voice.disconnect();
                    await interaction.reply({ content: `Successfully kicked ${member.user.username} from the voice channel.`, ephemeral: true });
                }
                catch (error) {
                    console.error('Error kicking user:', error);
                    await interaction.reply({ content: 'Failed to kick user from voice channel.', ephemeral: true });
                }
            }
            if (interaction.customId.startsWith('ban_select_')) {
                const channelId = interaction.customId.split('_')[2];
                const userId = interaction.values[0];
                const channel = interaction.guild?.channels.cache.get(channelId);
                const member = interaction.guild?.members.cache.get(userId);
                if (!channel || !member) {
                    await interaction.reply({ content: 'User or channel not found.', ephemeral: true });
                    return;
                }
                try {
                    await member.voice.disconnect();
                    await channel.permissionOverwrites.create(member, {
                        Connect: false
                    });
                    await interaction.reply({ content: `Successfully banned ${member.user.username} from the voice channel.`, ephemeral: true });
                }
                catch (error) {
                    console.error('Error banning user:', error);
                    await interaction.reply({ content: 'Failed to ban user from voice channel.', ephemeral: true });
                }
            }
        }
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('edit_voice_modal_')) {
                const channelId = interaction.customId.split('_')[3];
                const channel = interaction.guild?.channels.cache.get(channelId);
                if (!channel || channel.type !== discord_js_1.ChannelType.GuildVoice) {
                    await interaction.reply({ content: 'Channel not found or is not a voice channel.', ephemeral: true });
                    return;
                }
                const tempChannel = await prisma.temporaryVoiceChannel.findUnique({
                    where: { channelId: channelId }
                });
                if (!tempChannel || tempChannel.createdBy !== interaction.user.id) {
                    await interaction.reply({ content: 'Only the room owner can edit the voice channel.', ephemeral: true });
                    return;
                }
                const nameInput = interaction.fields.getTextInputValue('voice_name');
                const userLimit = parseInt(interaction.fields.getTextInputValue('voice_user_limit'));
                if (userLimit < 0 || userLimit > 99) {
                    await interaction.reply({ content: 'User limit must be between 0 and 99.', ephemeral: true });
                    return;
                }
                const finalName = nameInput.startsWith('VC | ')
                    ? nameInput
                    : `VC | ${nameInput}`;
                try {
                    await channel.edit({
                        name: finalName,
                        userLimit: userLimit
                    });
                    await interaction.reply({ content: 'Voice channel updated successfully!', ephemeral: true });
                }
                catch (error) {
                    console.error('Error updating voice channel:', error);
                    await interaction.reply({ content: 'Failed to update voice channel.', ephemeral: true });
                }
            }
        }
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }
            try {
                await command.execute(interaction);
            }
            catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
                }
                else {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            }
        }
    },
};
