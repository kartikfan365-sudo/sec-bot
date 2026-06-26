import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { Command } from './commandInterface';
import { GuildSettings } from '../database/schemas/GuildSettings';
import { Embeds } from '../utils/embeds';
import { logger } from '../utils/logger';

export const securityCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Configure security limits and log channel (Owner only)')
    .addSubcommand(sub =>
      sub
        .setName('limits')
        .setDescription('View and configure anti-nuke threshold limits')
        .addIntegerOption(o => o.setName('channel_delete_limit').setDescription('Max channel deletions allowed'))
        .addIntegerOption(o => o.setName('channel_delete_window').setDescription('Channel deletion window (seconds)'))
        .addIntegerOption(o => o.setName('role_delete_limit').setDescription('Max role deletions allowed'))
        .addIntegerOption(o => o.setName('role_delete_window').setDescription('Role deletion window (seconds)'))
        .addIntegerOption(o => o.setName('channel_create_limit').setDescription('Max channel creations allowed'))
        .addIntegerOption(o => o.setName('channel_create_window').setDescription('Channel creation window (seconds)'))
        .addIntegerOption(o => o.setName('role_create_limit').setDescription('Max role creations allowed'))
        .addIntegerOption(o => o.setName('role_create_window').setDescription('Role creation window (seconds)'))
        .addIntegerOption(o => o.setName('member_ban_limit').setDescription('Max member bans allowed'))
        .addIntegerOption(o => o.setName('member_ban_window').setDescription('Member ban window (seconds)'))
        .addIntegerOption(o => o.setName('member_kick_limit').setDescription('Max member kicks allowed'))
        .addIntegerOption(o => o.setName('member_kick_window').setDescription('Member kick window (seconds)'))
        .addBooleanOption(o => o.setName('dangerous_perms').setDescription('Enable dangerous permissions grant blocking'))
        .addBooleanOption(o => o.setName('bot_add').setDescription('Enable unauthorized bot additions blocking'))
        .addBooleanOption(o => o.setName('webhook_create').setDescription('Enable unauthorized webhooks blocking'))
    )
    .addSubcommand(sub =>
      sub
        .setName('logs')
        .setDescription('Set the channel for security alerts and logs')
        .addChannelOption(o => 
          o
            .setName('channel')
            .setDescription('Select a text channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { guild, user } = interaction;
    if (!guild) return;

    // Owner protection gate
    if (user.id !== guild.ownerId) {
      await interaction.reply({
        embeds: [Embeds.error('Access Denied', 'Only the Server Owner can execute security commands.')],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const subcommand = interaction.options.getSubcommand();

    try {
      // Find or create settings for this guild
      let settings = await GuildSettings.findOne({ guildId: guild.id });
      if (!settings) {
        settings = new GuildSettings({ guildId: guild.id });
      }

      if (subcommand === 'limits') {
        // Read options
        const chDelLimit = interaction.options.getInteger('channel_delete_limit');
        const chDelWin = interaction.options.getInteger('channel_delete_window');
        const rDelLimit = interaction.options.getInteger('role_delete_limit');
        const rDelWin = interaction.options.getInteger('role_delete_window');
        const chCreLimit = interaction.options.getInteger('channel_create_limit');
        const chCreWin = interaction.options.getInteger('channel_create_window');
        const rCreLimit = interaction.options.getInteger('role_create_limit');
        const rCreWin = interaction.options.getInteger('role_create_window');
        const banLimit = interaction.options.getInteger('member_ban_limit');
        const banWin = interaction.options.getInteger('member_ban_window');
        const kickLimit = interaction.options.getInteger('member_kick_limit');
        const kickWin = interaction.options.getInteger('member_kick_window');
        
        const dangerousPerms = interaction.options.getBoolean('dangerous_perms');
        const botAdd = interaction.options.getBoolean('bot_add');
        const webhookCreate = interaction.options.getBoolean('webhook_create');

        // Apply changes if provided
        if (chDelLimit !== null) settings.limits.channelDelete.limit = chDelLimit;
        if (chDelWin !== null) settings.limits.channelDelete.window = chDelWin;
        if (rDelLimit !== null) settings.limits.roleDelete.limit = rDelLimit;
        if (rDelWin !== null) settings.limits.roleDelete.window = rDelWin;
        if (chCreLimit !== null) settings.limits.channelCreate.limit = chCreLimit;
        if (chCreWin !== null) settings.limits.channelCreate.window = chCreWin;
        if (rCreLimit !== null) settings.limits.roleCreate.limit = rCreLimit;
        if (rCreWin !== null) settings.limits.roleCreate.window = rCreWin;
        if (banLimit !== null) settings.limits.memberBan.limit = banLimit;
        if (banWin !== null) settings.limits.memberBan.window = banWin;
        if (kickLimit !== null) settings.limits.memberKick.limit = kickLimit;
        if (kickWin !== null) settings.limits.memberKick.window = kickWin;

        if (dangerousPerms !== null) settings.limits.dangerousPermissionGrant.enabled = dangerousPerms;
        if (botAdd !== null) settings.limits.unauthorizedBotAdd.enabled = botAdd;
        if (webhookCreate !== null) settings.limits.dangerousWebhookCreate.enabled = webhookCreate;

        await settings.save();

        // Build status embed
        const fields = [
          { 
            name: '📂 Channel Deletion Limit', 
            value: `\`${settings.limits.channelDelete.limit}\` actions in \`${settings.limits.channelDelete.window}s\` (Enabled: \`${settings.limits.channelDelete.enabled}\`)`,
            inline: true 
          },
          { 
            name: '📂 Channel Creation Limit', 
            value: `\`${settings.limits.channelCreate.limit}\` actions in \`${settings.limits.channelCreate.window}s\` (Enabled: \`${settings.limits.channelCreate.enabled}\`)`,
            inline: true 
          },
          { 
            name: '🏷️ Role Deletion Limit', 
            value: `\`${settings.limits.roleDelete.limit}\` actions in \`${settings.limits.roleDelete.window}s\` (Enabled: \`${settings.limits.roleDelete.enabled}\`)`,
            inline: true 
          },
          { 
            name: '🏷️ Role Creation Limit', 
            value: `\`${settings.limits.roleCreate.limit}\` actions in \`${settings.limits.roleCreate.window}s\` (Enabled: \`${settings.limits.roleCreate.enabled}\`)`,
            inline: true 
          },
          { 
            name: '🔨 Member Ban Limit', 
            value: `\`${settings.limits.memberBan.limit}\` actions in \`${settings.limits.memberBan.window}s\` (Enabled: \`${settings.limits.memberBan.enabled}\`)`,
            inline: true 
          },
          { 
            name: '👢 Member Kick Limit', 
            value: `\`${settings.limits.memberKick.limit}\` actions in \`${settings.limits.memberKick.window}s\` (Enabled: \`${settings.limits.memberKick.enabled}\`)`,
            inline: true 
          },
          {
            name: '🛡️ Dangerous Perm Blocking',
            value: `Status: \`${settings.limits.dangerousPermissionGrant.enabled ? 'ENABLED' : 'DISABLED'}\``,
            inline: true
          },
          {
            name: '🤖 Unauthorized Bot Blocking',
            value: `Status: \`${settings.limits.unauthorizedBotAdd.enabled ? 'ENABLED' : 'DISABLED'}\``,
            inline: true
          },
          {
            name: '🪝 Webhook Creation Blocking',
            value: `Status: \`${settings.limits.dangerousWebhookCreate.enabled ? 'ENABLED' : 'DISABLED'}\``,
            inline: true
          }
        ];

        await interaction.editReply({
          embeds: [
            Embeds.info('Security Configuration Limits', `Anti-nuke threshold limits for **${guild.name}**:\nTo update limits, pass options to this command.`)
              .addFields(fields)
          ]
        });

      } else if (subcommand === 'logs') {
        const targetChannel = interaction.options.getChannel('channel', true);
        
        settings.loggingChannelId = targetChannel.id;
        await settings.save();

        await interaction.editReply({
          embeds: [Embeds.success('Log Channel Updated', `Successfully set the security alert log channel to <#${targetChannel.id}>.`)]
        });
      }
    } catch (error: any) {
      logger.error(`Error in /security command: ${error.message}`);
      await interaction.editReply({
        embeds: [Embeds.error('Command Error', 'An unexpected error occurred while modifying security settings.')]
      });
    }
  }
};
