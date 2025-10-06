import dotenv from 'dotenv';
dotenv.config();

import { config } from './config';
import { Client, Collection, GatewayIntentBits, ActivityType, Partials } from 'discord.js';
import path from 'path';
import fs from 'fs';

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// Command collection
(client as any).commands = new Collection();

// Determine if running in dev or production
const isDev = __filename.endsWith('.ts');

// ------------------------
// Load Commands
// ------------------------
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file =>
    file.endsWith(isDev ? '.ts' : '.js')
  );

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command?.data?.name) {
      (client as any).commands.set(command.data.name, command);
      console.log(`Loaded command: ${file}`);
    } else {
      console.warn(`Invalid command module: ${file}`);
    }
  }
} else {
  console.warn('No commands directory found.');
}

// ------------------------
// Load Events
// ------------------------
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file =>
    file.endsWith(isDev ? '.ts' : '.js')
  );

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (event?.name && typeof event.execute === 'function') {
      if (event.once) {
        client.once(event.name, (...args: any[]) => event.execute(...args));
      } else {
        client.on(event.name, (...args: any[]) => event.execute(...args));
      }
      console.log(`Loaded event: ${file}`);
    } else {
      console.warn(`Invalid event module: ${file}`);
    }
  }
} else {
  console.warn('No events directory found.');
}

// ------------------------
// Login and Set Presence
// ------------------------
client.login(config.DISCORD_TOKEN)
  .then(() => {
    client.user?.setPresence({
      activities: [{
        name: 'Planning Events 🏓',
        type: ActivityType.Streaming,
        url: 'https://vrchat.com/home'
      }],
      status: 'online'
    });
    console.log(`Logged in as ${client.user?.tag}!`);
    
  })
  .catch((error: any) => {
    console.error('Error logging in:', error);
  });
