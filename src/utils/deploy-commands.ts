import { REST, Routes } from 'discord.js';
import { config } from '../config'; // Make sure this exports DISCORD_TOKEN and DISCORD_CLIENT_ID
import * as fs from 'fs';
import * as path from 'path';

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

const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

type DeployCommandsProps = {
  guildId?: string; // Optional — if omitted, deploys globally
};

export async function deployCommands({ guildId }: DeployCommandsProps = {}) {
  try {
    if (commandsData.length === 0) {
      console.warn('⚠️ No valid commands found to deploy.');
      return;
    }

    if (guildId) {
      console.log(`🚀 Deploying commands to guild: ${guildId}`);
      const result = await rest.put(
        Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId),
        { body: commandsData }
      );
      if(!config.isDev){
        console.log(`✅ Successfully deployed ${Array.isArray(result) ? result.length : '?'} commands to guild ${guildId}`);
      } else {
        console.log(`✅ Successfully deployed ${Array.isArray(result) ? result.length : '?'} commands to guild ${guildId} (dev mode)`);
      }
    } else {
      console.log('🌍 Deploying global commands (this may take up to 1 hour to appear)...');
      const result = await rest.put(
        Routes.applicationCommands(config.DISCORD_CLIENT_ID),
        { body: commandsData }
      );
      console.log(`✅ Successfully deployed ${Array.isArray(result) ? result.length : '?'} global commands.`);
    }
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
  }
}
