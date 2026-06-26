import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from './commandInterface';
import { TrustedUser } from '../database/schemas/TrustedUser';
import { Embeds } from '../utils/embeds';
import { logger } from '../utils/logger';

export const trustCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('trust')
    .setDescription('Trust a user to bypass anti-nuke checks (Owner only)')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user to trust')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { guild, user } = interaction;
    if (!guild) return;

    // Owner protection gate
    if (user.id !== guild.ownerId) {
      await interaction.reply({
        embeds: [Embeds.error('Access Denied', 'Only the Server Owner can execute this command.')],
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    await interaction.deferReply({ ephemeral: true });

    try {
      // Check if trying to trust the bot itself or owner (both already immune)
      if (targetUser.id === guild.ownerId || targetUser.id === guild.client.user?.id) {
        await interaction.editReply({
          embeds: [Embeds.warning('Action Redundant', `**${targetUser.tag}** is already immune by default.`)]
        });
        return;
      }

      // Check if already trusted
      const existing = await TrustedUser.findOne({ guildId: guild.id, userId: targetUser.id });
      if (existing) {
        await interaction.editReply({
          embeds: [Embeds.warning('Already Trusted', `**${targetUser.tag}** is already in the trusted list.`)]
        });
        return;
      }

      // Add to database
      await TrustedUser.create({
        guildId: guild.id,
        userId: targetUser.id,
        username: targetUser.tag,
        addedBy: user.tag
      });

      await interaction.editReply({
        embeds: [Embeds.success('User Trusted', `Successfully added **${targetUser.tag}** (\`${targetUser.id}\`) to the trusted list.`)]
      });

    } catch (error: any) {
      logger.error(`Error in /trust command: ${error.message}`);
      await interaction.editReply({
        embeds: [Embeds.error('Command Error', 'An error occurred while adding the user to the trusted list.')]
      });
    }
  }
};

export const untrustCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('untrust')
    .setDescription('Untrust a user and restore anti-nuke checks (Owner only)')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user to untrust')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { guild, user } = interaction;
    if (!guild) return;

    if (user.id !== guild.ownerId) {
      await interaction.reply({
        embeds: [Embeds.error('Access Denied', 'Only the Server Owner can execute this command.')],
        ephemeral: true
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await TrustedUser.deleteOne({ guildId: guild.id, userId: targetUser.id });

      if (result.deletedCount === 0) {
        await interaction.editReply({
          embeds: [Embeds.error('User Not Found', `**${targetUser.tag}** is not in the trusted list.`)]
        });
      } else {
        await interaction.editReply({
          embeds: [Embeds.success('User Untrusted', `Successfully removed **${targetUser.tag}** from the trusted list.`)]
        });
      }
    } catch (error: any) {
      logger.error(`Error in /untrust command: ${error.message}`);
      await interaction.editReply({
        embeds: [Embeds.error('Command Error', 'An error occurred while removing the user.')]
      });
    }
  }
};

export const listTrustedCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('listtrusted')
    .setDescription('List all trusted users in this server (Owner only)'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { guild, user } = interaction;
    if (!guild) return;

    if (user.id !== guild.ownerId) {
      await interaction.reply({
        embeds: [Embeds.error('Access Denied', 'Only the Server Owner can execute this command.')],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const trusted = await TrustedUser.find({ guildId: guild.id });
      
      if (trusted.length === 0) {
        await interaction.editReply({
          embeds: [Embeds.info('Trusted Users List', 'There are no trusted users on this server.')]
        });
        return;
      }

      const list = trusted.map((u, idx) => 
        `${idx + 1}. **${u.username}** (\`${u.userId}\`) - Added by **${u.addedBy}** on <t:${Math.floor(u.addedAt.getTime() / 1000)}:d>`
      ).join('\n');

      await interaction.editReply({
        embeds: [Embeds.info('Trusted Users', `Trusted users bypass anti-nuke rate limits.\n\n${list}`)]
      });

    } catch (error: any) {
      logger.error(`Error in /listtrusted command: ${error.message}`);
      await interaction.editReply({
        embeds: [Embeds.error('Command Error', 'An error occurred while listing trusted users.')]
      });
    }
  }
};
