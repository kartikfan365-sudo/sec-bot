import { Client, GuildChannel, Role, GuildMember, GuildBan, Message } from 'discord.js';
import * as monitor from '../security/monitor';
import { commands } from '../commands/commandRegistry';
import { logger } from '../utils/logger';

export function registerEvents(client: Client): void {
  // Ready Event
  client.once('ready', () => {
    logger.info(`Logged in as ${client.user?.tag}!`);
  });

  // Interaction Create (Slash Commands)
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      logger.info(`Executing command /${interaction.commandName} by ${interaction.user.tag} in guild ${interaction.guildId}`);
      await command.execute(interaction);
    } catch (error: any) {
      logger.error(`Error executing command ${interaction.commandName}: ${error.message}`, error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true }).catch(() => null);
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true }).catch(() => null);
      }
    }
  });

  // Channel Creation
  client.on('channelCreate', async (channel) => {
    if (channel instanceof GuildChannel) {
      await monitor.monitorChannelCreate(channel);
    }
  });

  // Channel Deletion
  client.on('channelDelete', async (channel) => {
    if (channel instanceof GuildChannel) {
      await monitor.monitorChannelDelete(channel);
    }
  });

  // Channel Update
  client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (oldChannel instanceof GuildChannel && newChannel instanceof GuildChannel) {
      await monitor.monitorChannelUpdate(oldChannel, newChannel);
    }
  });

  // Role Creation
  client.on('roleCreate', async (role) => {
    await monitor.monitorRoleCreate(role);
  });

  // Role Deletion
  client.on('roleDelete', async (role) => {
    await monitor.monitorRoleDelete(role);
  });

  // Role Update
  client.on('roleUpdate', async (oldRole, newRole) => {
    await monitor.monitorRoleUpdate(oldRole, newRole);
  });

  // Guild Member Update (Dangerous Role Grants, Mass Timeouts)
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    await monitor.monitorMemberUpdate(oldMember as GuildMember, newMember as GuildMember);
  });

  // Guild Member Add (Bot Add Detection)
  client.on('guildMemberAdd', async (member) => {
    if (member.user.bot) {
      await monitor.monitorBotAdd(member);
    }
  });

  // Guild Member Remove (Kick Detection)
  client.on('guildMemberRemove', async (member) => {
    await monitor.monitorMemberKick(member.guild, member as GuildMember);
  });

  // Guild Ban Add (Ban Detection)
  client.on('guildBanAdd', async (ban: GuildBan) => {
    await monitor.monitorMemberBan(ban.guild, ban.user);
  });

  // Webhook Update
  client.on('webhookUpdate', async (channel) => {
    if (channel instanceof GuildChannel) {
      await monitor.monitorWebhookUpdate(channel);
    }
  });

  // Guild Update (Server Settings)
  client.on('guildUpdate', async (oldGuild, newGuild) => {
    await monitor.monitorGuildUpdate(oldGuild, newGuild);
  });

  // Emoji Delete
  client.on('emojiDelete', async (emoji) => {
    if (emoji.guild) {
      await monitor.monitorEmojiDelete(emoji.guild, emoji.id, emoji.name || 'unknown');
    }
  });

  // Sticker Delete
  client.on('stickerDelete', async (sticker) => {
    if (sticker.guild) {
      await monitor.monitorStickerDelete(sticker.guild, sticker.id, sticker.name);
    }
  });

  // Message Create (Spam Monitoring)
  client.on('messageCreate', async (message: Message) => {
    await monitor.monitorMessageCreate(message);
  });
}
