import { Collection, REST, Routes } from 'discord.js';
import { Command } from './commandInterface';
import { backupCommand } from './backup';
import { restoreCommand } from './restore';
import { trustCommand, untrustCommand, listTrustedCommand } from './trust';
import { templateCommand } from './template';
import { securityCommand } from './security';
import { helpCommand } from './help';
import { logger } from '../utils/logger';

export const commands = new Collection<string, Command>();

// Register commands in the collection
const commandsList = [
  backupCommand,
  restoreCommand,
  trustCommand,
  untrustCommand,
  listTrustedCommand,
  templateCommand,
  securityCommand,
  helpCommand
];

for (const cmd of commandsList) {
  commands.set(cmd.data.name, cmd);
}

/**
 * Registers slash commands globally with Discord's REST API.
 */
export async function registerSlashCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    logger.info('Started refreshing application (/) commands.');

    const body = commandsList.map(cmd => cmd.data.toJSON());

    await rest.put(
      Routes.applicationCommands(clientId),
      { body }
    );

    logger.info('Successfully reloaded application (/) commands.');
  } catch (error: any) {
    logger.error(`Failed to register slash commands: ${error.message}`, error);
  }
}
export default commands;
