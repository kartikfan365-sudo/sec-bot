import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from './commandInterface';
import { createBackup } from '../backup/backupService';
import { Backup } from '../database/schemas/Backup';
import { Embeds } from '../utils/embeds';
import { logger } from '../utils/logger';

export const backupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Manage server backups (Owner only)')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a manual backup of the server')
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List all available backups for this server')
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Delete a specific backup')
        .addStringOption(opt =>
          opt
            .setName('id')
            .setDescription('The UUID of the backup to delete')
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { guild, user } = interaction;
    if (!guild) return;

    // Owner protection gate
    if (user.id !== guild.ownerId) {
      await interaction.reply({
        embeds: [Embeds.error('Access Denied', 'Only the Server Owner can execute backup commands.')],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'create') {
        const backup = await createBackup(guild, 'manual');
        await interaction.editReply({
          embeds: [Embeds.success('Backup Created', `Successfully created server backup!\n**ID:** \`${backup.backupId}\`\n**Date:** <t:${Math.floor(backup.createdAt.getTime() / 1000)}:F>`)]
        });
      } else if (subcommand === 'list') {
        const backups = await Backup.find({ guildId: guild.id }).sort({ createdAt: -1 }).limit(10);
        
        if (backups.length === 0) {
          await interaction.editReply({
            embeds: [Embeds.info('No Backups Found', 'There are no backups saved for this server yet.')]
          });
          return;
        }

        const listContent = backups.map((b, idx) => 
          `${idx + 1}. \`${b.backupId}\` (${b.type.toUpperCase()}) - <t:${Math.floor(b.createdAt.getTime() / 1000)}:R>`
        ).join('\n');

        await interaction.editReply({
          embeds: [Embeds.info('Guild Backups List', `Showing latest 10 backups for **${guild.name}**:\n\n${listContent}`)]
        });
      } else if (subcommand === 'delete') {
        const backupId = interaction.options.getString('id', true);
        const result = await Backup.deleteOne({ guildId: guild.id, backupId });

        if (result.deletedCount === 0) {
          await interaction.editReply({
            embeds: [Embeds.error('Backup Not Found', `No backup with ID \`${backupId}\` was found for this guild.`)]
          });
        } else {
          await interaction.editReply({
            embeds: [Embeds.success('Backup Deleted', `Successfully deleted backup \`${backupId}\`.`)]
          });
        }
      }
    } catch (error: any) {
      logger.error(`Error in /backup command: ${error.message}`);
      await interaction.editReply({
        embeds: [Embeds.error('Command Error', 'An unexpected error occurred while executing the command.')]
      });
    }
  }
};
