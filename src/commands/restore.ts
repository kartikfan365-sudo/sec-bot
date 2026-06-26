import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from './commandInterface';
import { restoreServer } from '../restore/restoreService';
import { Backup } from '../database/schemas/Backup';
import { Embeds } from '../utils/embeds';
import { logger } from '../utils/logger';

export const restoreCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Restore the server layout from a backup (Owner only)')
    .addStringOption(opt =>
      opt
        .setName('id')
        .setDescription('The UUID of the backup to restore')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { guild, user } = interaction;
    if (!guild) return;

    // Owner protection gate
    if (user.id !== guild.ownerId) {
      await interaction.reply({
        embeds: [Embeds.error('Access Denied', 'Only the Server Owner can execute the restore command.')],
        ephemeral: true
      });
      return;
    }

    const backupId = interaction.options.getString('id', true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const backup = await Backup.findOne({ guildId: guild.id, backupId });
      if (!backup) {
        await interaction.editReply({
          embeds: [Embeds.error('Backup Not Found', `No backup with ID \`${backupId}\` was found for this server.`)]
        });
        return;
      }

      // Warn the owner that restoring is destructive and will delete channels/roles
      await interaction.editReply({
        embeds: [Embeds.warning(
          'Rebuilding Server Layout',
          `Initializing restore of backup \`${backupId}\`.\nThis will delete all current channels and non-bot roles, then rebuild them. Real-time updates will be sent to your DMs.`
        )]
      });

      // Fetch owner for DM updates
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner) {
        await owner.send({
          embeds: [Embeds.info('Restore Initialized', `Starting the rebuild of **${guild.name}**.\nTotal tasks scheduled. Please wait...`)]
        }).catch(() => null);
      }

      // Initialize restore queue
      const queue = restoreServer(guild, backup.data as any);

      // Handle progress updates
      let lastDMSent = Date.now();
      queue.onProgress = (completed, total, currentTask) => {
        // Limit DM updates to once every 4 seconds to avoid rate limits
        if (owner && (Date.now() - lastDMSent > 4000 || completed === total)) {
          const percent = Math.floor((completed / total) * 100);
          owner.send({
            embeds: [Embeds.info(
              `Restore Progress: ${percent}%`,
              `Completed **${completed}/${total}** tasks.\nCurrently executing: \`${currentTask}\``
            )]
          }).catch(() => null);
          lastDMSent = Date.now();
        }
      };

      queue.onComplete = () => {
        if (owner) {
          owner.send({
            embeds: [Embeds.success('Restore Complete', `Successfully finished rebuilding **${guild.name}** from backup \`${backupId}\`!`)]
          }).catch(() => null);
        }
      };

      queue.onError = (err) => {
        if (owner) {
          owner.send({
            embeds: [Embeds.error('Restore Failed', `An error occurred during restore:\n\`\`\`${err.message}\`\`\``)]
          }).catch(() => null);
        }
      };

    } catch (error: any) {
      logger.error(`Error in /restore command: ${error.message}`);
      await interaction.editReply({
        embeds: [Embeds.error('Command Error', 'An unexpected error occurred while executing the restore.')]
      });
    }
  }
};
