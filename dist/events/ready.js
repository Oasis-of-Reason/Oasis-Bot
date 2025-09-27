"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const deploy_commands_1 = require("../utils/deploy-commands");
const config_1 = require("../config");
module.exports = {
    name: discord_js_1.Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        if (!config_1.config.isDev) {
            for (const [guildId] of client.guilds.cache) {
                await (0, deploy_commands_1.deployCommands)({ guildId: guildId });
                console.log(`Deployed commands to guild: ${guildId}`);
            }
        }
        else {
            await (0, deploy_commands_1.deployCommands)({ guildId: config_1.config.isDev });
            console.log(`Deployed commands to test guild: ${config_1.config.isDev}`);
        }
    },
};
