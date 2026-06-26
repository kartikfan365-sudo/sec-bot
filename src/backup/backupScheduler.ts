import { Client } from 'discord.js';
import { GuildSettings } from '../database/schemas/GuildSettings';
import { createBackup } from './backupService';
import { Backup } from '../database/schemas/Backup';
import { logger } from '../utils/logger';

/**
 * Checks and executes scheduled backups for all guilds.
 */
export async function runScheduledBackups(client: Client): Promise<void> {
  const guilds = client.guilds.cache.values();

  for (const guild of guilds) {
    try {
      let settings = await GuildSettings.findOne({ guildId: guild.id });
      if (!settings) {
        settings = await GuildSettings.create({ guildId: guild.id });
      }

      if (settings.autoBackupInterval === 'disabled') continue;

      const now = new Date();

      // 1. Hourly Backup Check
      if (settings.autoBackupInterval === 'hourly') {
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const recentHourly = await Backup.findOne({
          guildId: guild.id,
          type: 'hourly',
          createdAt: { $gte: oneHourAgo }
        });

        if (!recentHourly) {
          logger.info(`Running scheduled HOURLY backup for guild: ${guild.name}`);
          await createBackup(guild, 'hourly').catch(err => {
            logger.error(`Scheduled hourly backup failed for ${guild.name}: ${err.message}`);
          });
        }
      }

      // 2. Daily Backup Check (Always run daily backup unless disabled)
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentDaily = await Backup.findOne({
        guildId: guild.id,
        type: 'daily',
        createdAt: { $gte: oneDayAgo }
      });

      if (!recentDaily) {
        logger.info(`Running scheduled DAILY backup for guild: ${guild.name}`);
        await createBackup(guild, 'daily').catch(err => {
          logger.error(`Scheduled daily backup failed for ${guild.name}: ${err.message}`);
        });
      }

      // 3. Cleanup old backups according to retention
      const retentionMs = settings.backupRetentionDays * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(now.getTime() - retentionMs);

      // Clean up hourly and daily backups older than retention period (keep manuals unless requested)
      const deleteResult = await Backup.deleteMany({
        guildId: guild.id,
        type: { $in: ['hourly', 'daily'] },
        createdAt: { $lt: cutoffDate }
      });

      if (deleteResult.deletedCount > 0) {
        logger.info(`Cleaned up ${deleteResult.deletedCount} expired backups for guild ${guild.name}`);
      }

    } catch (error: any) {
      logger.error(`Error in scheduled backup process for guild ${guild.id}: ${error.message}`);
    }
  }
}

/**
 * Starts the background backup scheduler daemon.
 */
export function startBackupScheduler(client: Client): void {
  logger.info('Initializing automated backup scheduler daemon (15 min interval)...');
  
  // Run check every 15 minutes
  setInterval(async () => {
    logger.info('Running background backup scheduler tick...');
    await runScheduledBackups(client);
  }, 15 * 60 * 1000);

  // Run initial check 10 seconds after startup to ensure fresh backups on boot
  client.once('ready', () => {
    setTimeout(async () => {
      logger.info('Running startup backup check...');
      await runScheduledBackups(client);
    }, 10000);
  });
}
