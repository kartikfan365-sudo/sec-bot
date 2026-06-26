import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config/config';
import { connectDatabase } from './database/database';
import { registerEvents } from './events/eventHandler';
import { registerSlashCommands } from './commands/commandRegistry';
import { startBackupScheduler } from './backup/backupScheduler';
import { startDashboardServer } from './dashboard/server';
import { logger } from './utils/logger';

async function bootstrap() {
  logger.info('Starting Discord Security & Server Recovery Bot bootstrap process...');

  // 1. Connect to Database
  await connectDatabase();

  // 2. Initialize Discord Client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildEmojisAndStickers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  // 3. Register Client Event Listeners
  registerEvents(client);

  // 4. Log in and Deploy Slash Commands
  client.once('ready', async () => {
    logger.info(`Discord Bot successfully logged in as ${client.user?.tag}`);

    // Register Slash Commands globally
    if (client.user) {
      await registerSlashCommands(config.discordToken, client.user.id);
    }

    // 5. Start Backup Scheduler Daemon
    startBackupScheduler(client);

    // 6. Start Dashboard Express Server
    startDashboardServer(client);
  });

  // Log in to Discord
  try {
    await client.login(config.discordToken);
  } catch (error: any) {
    logger.error(`Failed to log in to Discord: ${error.message}`);
    // If token is default/placeholder, we don't crash the entire app if we want the dashboard server to run,
    // but standard behavior is to exit. Let's warn the user and keep dashboard running or exit.
    // If the token is invalid, Express dashboard might still be useful to explore. Let's start the dashboard anyway
    // if client ready isn't reached, or just let it crash so the user knows they need to set up their .env.
    // To be production-grade: log, retry, or exit.
    process.exit(1);
  }
}

// Global Exception Handlers to prevent crashes (No Crashes Requirement!)
process.on('unhandledRejection', (reason: any, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', error);
});

bootstrap();
