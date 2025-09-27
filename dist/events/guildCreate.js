"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const deploy_commands_1 = require("../utils/deploy-commands");
const config_1 = require("../config");
module.exports = {
    name: discord_js_1.Events.GuildCreate,
    async execute(guild) {
        if (!config_1.config.isDev) {
            await (0, deploy_commands_1.deployCommands)({ guildId: guild.id });
            console.log(`Deployed commands to new guild: ${guild.id}`);
        }
        else {
            console.log(`Tried to deploy commands to a new guild (${guild.id}), but this is dev mode. Skipping.`);
        }
    },
};
