"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const FORMATS = [
    { label: "Short time", value: "t", description: "15:03" },
    { label: "Long time", value: "T", description: "15:03:30" },
    { label: "Short date", value: "d", description: "30/06/2021" },
    { label: "Long date", value: "D", description: "30 June 2021" },
    { label: "Short datetime", value: "f", description: "30 June 2021 15:03" },
    { label: "Long datetime", value: "F", description: "Wednesday, 30 June 2021 15:03" },
    { label: "Relative", value: "R", description: "2 months ago" },
];
module.exports = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName("timestamp")
        .setDescription("Convert a date/time into Discord timestamp format and DM it to you")
        .addStringOption(opt => opt
        .setName("datetime")
        .setDescription("Date/time to convert (ISO, JS parseable, or epoch seconds/ms)")
        .setRequired(true)),
    async execute(interaction) {
        const input = interaction.options.getString("datetime", true).trim();
        let date = new Date(input);
        if (isNaN(date.getTime())) {
            const num = Number(input);
            if (!Number.isNaN(num)) {
                date = num >= 1e12 ? new Date(num) : new Date(num * 1000);
            }
        }
        if (isNaN(date.getTime())) {
            await interaction.reply({
                content: "❌ Could not parse that date/time. Try ISO (2025-09-27T15:00), `YYYY-MM-DD HH:MM`, or epoch seconds.",
                ephemeral: true,
            });
            return;
        }
        const unixSeconds = Math.floor(date.getTime() / 1000);
        const select = new discord_js_1.StringSelectMenuBuilder()
            .setCustomId("ts_format")
            .setPlaceholder("Choose a Discord timestamp format")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(FORMATS.map((f) => ({
            label: f.label,
            description: f.description,
            value: f.value,
        })));
        const row = new discord_js_1.ActionRowBuilder().addComponents(select);
        const replyMsg = (await interaction.reply({
            content: `Parsed date: **${date.toUTCString()}**\nUnix seconds: **${unixSeconds}**\nChoose which Discord timestamp format you want:`,
            components: [row],
            ephemeral: true,
            fetchReply: true,
        }));
        try {
            const collected = (await replyMsg.awaitMessageComponent({
                filter: (i) => i.user.id === interaction.user.id && i.customId === "ts_format",
                componentType: discord_js_1.ComponentType.StringSelect,
                time: 60000,
            }));
            await collected.deferUpdate();
            const fmt = collected.values[0];
            const discordString = `<t:${unixSeconds}:${fmt}>`;
            await interaction.editReply({
                content: `Here is your Discord timestamp:\n\`${discordString}\`\nRendered: ${discordString}`,
                components: [],
            });
        }
        catch {
            await interaction.editReply({
                content: "⌛ No selection made. Command timed out.",
                components: [],
            });
        }
    }
};
