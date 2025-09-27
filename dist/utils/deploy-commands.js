"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployCommands = deployCommands;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const commandsPath = path.join(__dirname, '../commands');
const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith('.ts') || file.endsWith('.js'));
const commandsData = commandFiles
    .map(file => {
    const command = require(path.join(commandsPath, file));
    if (!command?.data || typeof command.data.toJSON !== 'function') {
        console.warn(`⚠️ Skipping invalid command file: ${file}`);
        return null;
    }
    return command.data.toJSON();
})
    .filter(Boolean);
const rest = new discord_js_1.REST({ version: '10' }).setToken(config_1.config.DISCORD_TOKEN);
async function deployCommands({ guildId } = {}) {
    try {
        if (commandsData.length === 0) {
            console.warn('⚠️ No valid commands found to deploy.');
            return;
        }
        if (guildId) {
            console.log(`🚀 Deploying commands to guild: ${guildId}`);
            const result = await rest.put(discord_js_1.Routes.applicationGuildCommands(config_1.config.DISCORD_CLIENT_ID, guildId), { body: commandsData });
            if (!config_1.config.isDev) {
                console.log(`✅ Successfully deployed ${Array.isArray(result) ? result.length : '?'} commands to guild ${guildId}`);
            }
            else {
                console.log(`✅ Successfully deployed ${Array.isArray(result) ? result.length : '?'} commands to guild ${guildId} (dev mode)`);
            }
        }
        else {
            console.log('🌍 Deploying global commands (this may take up to 1 hour to appear)...');
            const result = await rest.put(discord_js_1.Routes.applicationCommands(config_1.config.DISCORD_CLIENT_ID), { body: commandsData });
            console.log(`✅ Successfully deployed ${Array.isArray(result) ? result.length : '?'} global commands.`);
        }
    }
    catch (error) {
        console.error('❌ Failed to deploy commands:', error);
    }
}
