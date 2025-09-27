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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const config_1 = require("./config");
const discord_js_1 = require("discord.js");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
        discord_js_1.GatewayIntentBits.DirectMessages,
        discord_js_1.GatewayIntentBits.GuildVoiceStates
    ],
    partials: [discord_js_1.Partials.Channel]
});
client.commands = new discord_js_1.Collection();
const isDev = __filename.endsWith('.ts');
const commandsPath = path_1.default.join(__dirname, 'commands');
if (fs_1.default.existsSync(commandsPath)) {
    const commandFiles = fs_1.default.readdirSync(commandsPath).filter(file => file.endsWith(isDev ? '.ts' : '.js'));
    for (const file of commandFiles) {
        const command = require(path_1.default.join(commandsPath, file));
        if (command?.data?.name) {
            client.commands.set(command.data.name, command);
            console.log(`Loaded command: ${file}`);
        }
        else {
            console.warn(`Invalid command module: ${file}`);
        }
    }
}
else {
    console.warn('No commands directory found.');
}
const eventsPath = path_1.default.join(__dirname, 'events');
if (fs_1.default.existsSync(eventsPath)) {
    const eventFiles = fs_1.default.readdirSync(eventsPath).filter(file => file.endsWith(isDev ? '.ts' : '.js'));
    for (const file of eventFiles) {
        const filePath = path_1.default.join(eventsPath, file);
        const event = require(filePath);
        if (event?.name && typeof event.execute === 'function') {
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            }
            else {
                client.on(event.name, (...args) => event.execute(...args));
            }
            console.log(`Loaded event: ${file}`);
        }
        else {
            console.warn(`Invalid event module: ${file}`);
        }
    }
}
else {
    console.warn('No events directory found.');
}
client.login(config_1.config.DISCORD_TOKEN)
    .then(() => {
    client.user?.setPresence({
        activities: [{
                name: 'Planning Events 🏓',
                type: discord_js_1.ActivityType.Streaming,
                url: 'https://vrchat.com/home'
            }],
        status: 'online'
    });
    console.log(`Logged in as ${client.user?.tag}!`);
})
    .catch((error) => {
    console.error('Error logging in:', error);
});
client.once("ready", () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const command = require("./commands/Magic8Ball");
    if (interaction.commandName === "shakeball") {
        await command.execute(interaction);
    }
});
