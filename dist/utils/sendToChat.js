"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToGuildChannel = sendToGuildChannel;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function sendToGuildChannel(client, key, content, options) {
    for (const [guildId] of client.guilds.cache) {
        try {
            const config = await prisma.guildConfig.findUnique({ where: { id: guildId } });
            const channelId = config?.[key];
            if (!channelId) {
                console.log(`[sendToGuildChannel] No channel configured for ${String(key)} in guild ${String(guildId)}`);
                continue;
            }
            const channel = client.channels.cache.get(channelId);
            if (!channel || !channel.isTextBased()) {
                console.warn(`[sendToGuildChannel] Invalid or missing text channel for guild ${String(guildId)}`);
                continue;
            }
            const messagePayload = {
                content,
                ...options,
            };
            await channel.send(messagePayload);
        }
        catch (err) {
            console.error(`[sendToGuildChannel] Error sending message to guild ${String(guildId)}:`, err);
        }
    }
}
