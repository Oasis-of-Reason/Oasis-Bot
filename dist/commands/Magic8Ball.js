"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function safeReply(interaction, content, ephemeral = false) {
    const opts = typeof content === "string" ? { content } : { ...content };
    if (ephemeral)
        opts.flags = 64;
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(opts).catch(() => interaction.followUp(opts));
        }
        else {
            return await interaction.reply(opts);
        }
    }
    catch (err) {
        console.error("safeReply error:", err);
        try {
            if (!interaction.replied && !interaction.deferred)
                return await interaction.reply(opts);
            return await interaction.followUp(opts);
        }
        catch {
            return null;
        }
    }
}
module.exports = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('shakeball')
        .setDescription('Interact with the Magic 8 Ball')
        .addSubcommand(sub => sub.setName('ask')
        .setDescription('Get a prophecy from the Magic 8 Ball'))
        .addSubcommand(sub => sub.setName('add')
        .setDescription('Add a new prophecy')
        .addStringOption(opt => opt.setName('message')
        .setDescription('The prophecy to add')
        .setRequired(true)))
        .addSubcommand(sub => sub.setName('remove')
        .setDescription('Remove a prophecy by ID')
        .addIntegerOption(opt => opt.setName('id')
        .setDescription('The ID of the prophecy to remove')
        .setRequired(true)))
        .addSubcommand(sub => sub.setName('list')
        .setDescription('List all prophecies')),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'ask') {
            const all = await prisma.magic8BallProphecy.findMany({ select: { id: true, message: true } });
            if (all.length === 0) {
                await safeReply(interaction, "No prophecies found in the database!");
                return;
            }
            const picked = all[Math.floor(Math.random() * all.length)];
            await safeReply(interaction, picked?.message ?? "The spirits are silent...");
            return;
        }
        if (sub === 'add') {
            const message = interaction.options.getString('message', true);
            const created = await prisma.magic8BallProphecy.create({ data: { message } });
            await safeReply(interaction, `Added prophecy #${created.id}: "${created.message}"`);
            return;
        }
        if (sub === 'remove') {
            const id = interaction.options.getInteger('id', true);
            try {
                const deleted = await prisma.magic8BallProphecy.delete({ where: { id } });
                await safeReply(interaction, `Removed prophecy #${id}: "${deleted.message}"`);
            }
            catch {
                await safeReply(interaction, `No prophecy found with ID ${id}.`);
            }
            return;
        }
        if (sub === 'list') {
            const all = await prisma.magic8BallProphecy.findMany();
            if (all.length === 0) {
                await safeReply(interaction, "No prophecies found.");
                return;
            }
            const lines = all.map((r) => `${r.id}: ${r.message}`);
            let chunk = "";
            for (const line of lines) {
                if ((chunk + line + "\n").length > 1800) {
                    await safeReply(interaction, chunk);
                    chunk = line + "\n";
                }
                else {
                    chunk += line + "\n";
                }
            }
            if (chunk)
                await safeReply(interaction, chunk);
            return;
        }
    },
};
