import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from './commandInterface';
import { Embeds } from '../utils/embeds';
import { logger } from '../utils/logger';

export const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display information about the bot commands and security features'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { guild } = interaction;
    if (!guild) return;

    await interaction.deferReply({ ephemeral: true });

    try {
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Discord Security & Recovery Bot Help')
        .setDescription(`This bot protects your server against raids, compromised admins, and nuking attempts, and provides full recovery capabilities.`)
        .setColor(0x3B82F6) // Bright blue
        .addFields(
          {
            name: '👑 Owner-Only Commands',
            value: `Only the Server Owner can execute these commands:
• \`/backup create\` - Create a manual full server backup.
• \`/backup list\` - List all available backups.
• \`/backup delete <id>\` - Delete a backup.
• \`/restore <id>\` - Completely rebuild the server using a backup.
• \`/template save <name>\` - Save current server layout as a template.
• \`/template list\` - List saved templates.
• \`/template apply <name>\` - Apply a template.
• \`/template delete <name>\` - Delete a template.
• \`/security limits\` - View/configure anti-nuke thresholds.
• \`/security logs <channel>\` - Set the security alerts channel.
• \`/trust <user>\` - Add user to bypass anti-nuke rate limits.
• \`/untrust <user>\` - Remove user from bypass list.
• \`/listtrusted\` - View all trusted users.`
          },
          {
            name: '🔒 Automated Security Systems',
            value: `The bot actively monitors:
• **Mass Channel Deletion/Creation** (Limit: 3 deletes in 5s, 10 creates in 10s)
• **Mass Role Deletion/Creation** (Limit: 5 deletes in 10s, 10 creates in 10s)
• **Mass Ban/Kick/Timeouts** (Limit: 5 bans in 10s, 5 kicks in 10s)
• **Dangerous Permissions** (Blocks unauthorized role updates adding Administrator/Manage Roles)
• **Dangerous Webhooks** (Blocks unauthorized webhook creations)
• **Unauthorized Bot Additions** (Immediately kicks rogue bots and quarantines the inviter)
• **Guild Settings changes** (Reverts vanity, name, icon updates if made by untrusted user)
• **Chat Spam Protection** (Blocks message spam, mention spam, and invite link spam)`
          },
          {
            name: '💻 Web Dashboard',
            value: `Manage your server configuration, trusted users, logs, backups, and templates visually at:
**[Go to Dashboard](${process.env.DASHBOARD_URL || 'http://localhost:5000'})**`
          }
        )
        .setFooter({ text: 'Discord Security & Server Recovery System' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      logger.error(`Error in /help command: ${error.message}`);
      await interaction.editReply({
        embeds: [Embeds.error('Command Error', 'An error occurred while generating the help information.')]
      });
    }
  }
};
