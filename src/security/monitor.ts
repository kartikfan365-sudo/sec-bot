import {
  Guild,
  AuditLogEvent,
  ChannelType,
  GuildChannel,
  Role,
  GuildMember,
  Webhook,
  GuildAuditLogsEntry,
  PermissionsBitField,
  Message
} from 'discord.js';
import { GuildSettings } from '../database/schemas/GuildSettings';
import { TrustedUser } from '../database/schemas/TrustedUser';
import { AuditLog } from '../database/schemas/AuditLog';
import { rateLimiter } from './rateLimiter';
import { executeQuarantine } from './quarantine';
import { logger } from '../utils/logger';

// List of dangerous permissions that untrusted users should not be allowed to grant
export const DANGEROUS_PERMISSIONS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.ManageGuild
];

/**
 * Helper to fetch the recent executor of an audit log event.
 */
async function getRecentExecutor(
  guild: Guild,
  actionType: AuditLogEvent,
  targetId: string | null = null,
  timeWindowMs = 12000
): Promise<{ id: string; tag: string; entry: GuildAuditLogsEntry } | null> {
  try {
    const auditLogs = await guild.fetchAuditLogs({
      limit: 10,
      type: actionType
    });
    
    const entry = auditLogs.entries.find(e => {
      const timeDiff = Date.now() - e.createdTimestamp;
      const targetMatches = targetId ? e.targetId === targetId : true;
      return targetMatches && timeDiff < timeWindowMs;
    });

    if (entry && entry.executor) {
      return { id: entry.executor.id, tag: entry.executor.tag || 'unknown', entry };
    }
    return null;
  } catch (error: any) {
    logger.error(`Error fetching audit logs in guild ${guild.id}: ${error.message}`);
    return null;
  }
}

/**
 * Checks if a user is immune to anti-nuke (owner or trusted).
 */
async function isImmune(guild: Guild, userId: string): Promise<boolean> {
  if (userId === guild.ownerId) return true;
  if (userId === guild.client.user?.id) return true;
  
  const trusted = await TrustedUser.findOne({ guildId: guild.id, userId });
  return !!trusted;
}

/**
 * Shared logic for checking rate-limited actions.
 */
async function checkRateLimit(
  guild: Guild,
  actionType: AuditLogEvent,
  targetId: string,
  limitKey: 'channelDelete' | 'roleDelete' | 'channelCreate' | 'roleCreate' | 'memberBan' | 'memberKick',
  actionLabel: string,
  details: string
): Promise<void> {
  const result = await getRecentExecutor(guild, actionType, targetId);
  if (!result) return;
  const { id: executorId, tag: executorTag, entry } = result;

  if (await isImmune(guild, executorId)) return;

  const settings = await GuildSettings.findOne({ guildId: guild.id });
  const rule = settings?.limits[limitKey];
  if (!rule || !rule.enabled) return;

  const isLimited = rateLimiter.isRateLimited(
    guild.id,
    executorId,
    limitKey,
    rule.limit,
    rule.window
  );

  if (isLimited) {
    await executeQuarantine(
      guild,
      executorId,
      actionLabel,
      `${details}. Rate limit exceeded (${rule.limit} per ${rule.window}s).`,
      entry.reason || undefined
    );
  }
}

/**
 * Monitor Channel Creation
 */
export async function monitorChannelCreate(channel: GuildChannel): Promise<void> {
  const { guild } = channel;
  await checkRateLimit(
    guild,
    AuditLogEvent.ChannelCreate,
    channel.id,
    'channelCreate',
    'MASS_CHANNEL_CREATION',
    `Created channel/category: #${channel.name}`
  );
}

/**
 * Monitor Channel Deletion
 */
export async function monitorChannelDelete(channel: GuildChannel): Promise<void> {
  const { guild } = channel;
  await checkRateLimit(
    guild,
    AuditLogEvent.ChannelDelete,
    channel.id,
    'channelDelete',
    'MASS_CHANNEL_DELETION',
    `Deleted channel/category: #${channel.name}`
  );
}

/**
 * Monitor Channel Updates
 */
export async function monitorChannelUpdate(oldChannel: GuildChannel, newChannel: GuildChannel): Promise<void> {
  const { guild } = newChannel;
  const parentChanged = oldChannel.parentId !== newChannel.parentId;
  const nameChanged = oldChannel.name !== newChannel.name;
  
  if (parentChanged || nameChanged) {
    const result = await getRecentExecutor(guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    if (!result) return;
    const { id: executorId, entry } = result;

    if (await isImmune(guild, executorId)) return;

    const settings = await GuildSettings.findOne({ guildId: guild.id });
    if (!settings?.limits.channelDelete.enabled) return;

    await executeQuarantine(
      guild,
      executorId,
      'CHANNEL_UPDATE',
      `Modified channel #${oldChannel.name} settings: ${nameChanged ? `Renamed to #${newChannel.name}` : ''} ${parentChanged ? 'Moved category' : ''}`,
      entry.reason || undefined
    );
  }
}


/**
 * Monitor Role Creation
 */
export async function monitorRoleCreate(role: Role): Promise<void> {
  const { guild } = role;
  await checkRateLimit(
    guild,
    AuditLogEvent.RoleCreate,
    role.id,
    'roleCreate',
    'MASS_ROLE_CREATION',
    `Created role: ${role.name}`
  );
}

/**
 * Monitor Role Deletion
 */
export async function monitorRoleDelete(role: Role): Promise<void> {
  const { guild } = role;
  await checkRateLimit(
    guild,
    AuditLogEvent.RoleDelete,
    role.id,
    'roleDelete',
    'MASS_ROLE_DELETION',
    `Deleted role: ${role.name}`
  );
}

/**
 * Monitor Bans
 */
export async function monitorMemberBan(guild: Guild, user: { id: string }): Promise<void> {
  await checkRateLimit(
    guild,
    AuditLogEvent.MemberBanAdd,
    user.id,
    'memberBan',
    'MASS_BANS',
    `Banned user: <@${user.id}>`
  );
}

/**
 * Monitor Kicks (checks if a member left due to a kick)
 */
export async function monitorMemberKick(guild: Guild, member: GuildMember): Promise<void> {
  const result = await getRecentExecutor(guild, AuditLogEvent.MemberKick, member.id);
  if (!result) return;
  const { id: executorId, tag: executorTag, entry } = result;

  if (await isImmune(guild, executorId)) return;

  const settings = await GuildSettings.findOne({ guildId: guild.id });
  const rule = settings?.limits.memberKick;
  if (!rule || !rule.enabled) return;

  const isLimited = rateLimiter.isRateLimited(
    guild.id,
    executorId,
    'memberKick',
    rule.limit,
    rule.window
  );

  if (isLimited) {
    await executeQuarantine(
      guild,
      executorId,
      'MASS_KICKS',
      `Kicked user: ${member.user.tag}. Rate limit exceeded (${rule.limit} per ${rule.window}s).`,
      entry.reason || undefined
    );
  }
}

/**
 * Monitor Role Updates (checks if dangerous permissions were granted to a role)
 */
export async function monitorRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
  const { guild } = newRole;
  
  // Find which permissions were added
  const oldPerms = oldRole.permissions;
  const newPerms = newRole.permissions;
  
  const addedDangerousPerms = DANGEROUS_PERMISSIONS.filter(
    perm => !oldPerms.has(perm) && newPerms.has(perm)
  );

  if (addedDangerousPerms.length === 0) return;

  // Find who did it
  const result = await getRecentExecutor(guild, AuditLogEvent.RoleUpdate, newRole.id);
  if (!result) return;
  const { id: executorId, entry } = result;

  if (await isImmune(guild, executorId)) return;

  const settings = await GuildSettings.findOne({ guildId: guild.id });
  if (!settings?.limits.dangerousPermissionGrant.enabled) return;

  // Revert the permissions immediately
  if (newRole.editable) {
    await newRole.setPermissions(oldPerms, 'Anti-nuke: Reverting unauthorized dangerous permission grant').catch(err => {
      logger.error(`Failed to revert role permissions for ${newRole.name}: ${err.message}`);
    });
  }

  // Quarantine executor
  const permNames = addedDangerousPerms.map(p => new PermissionsBitField(p).toArray().join(', ')).join(' & ');
  await executeQuarantine(
    guild,
    executorId,
    'DANGEROUS_PERMISSION_GRANT',
    `Modified role ${newRole.name} to grant dangerous permission(s): ${permNames}`,
    entry.reason || undefined
  );
}

/**
 * Monitor Guild Member Role Changes (checks if a user was given a role with dangerous permissions)
 */
export async function monitorMemberUpdate(oldMember: GuildMember, newMember: GuildMember): Promise<void> {
  const { guild } = newMember;

  // 1. Check if a role with dangerous permissions was added to the member
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;
  const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));

  if (addedRoles.size > 0) {
    // Check if any added role has dangerous permissions
    const hasDangerousRole = addedRoles.some(role => 
      DANGEROUS_PERMISSIONS.some(perm => role.permissions.has(perm))
    );

    if (hasDangerousRole) {
      const result = await getRecentExecutor(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
      if (result) {
        const { id: executorId, entry } = result;
        if (!(await isImmune(guild, executorId))) {
          const settings = await GuildSettings.findOne({ guildId: guild.id });
          if (settings?.limits.dangerousPermissionGrant.enabled) {
            // Revert changes (remove the added roles)
            if (newMember.manageable) {
              await newMember.roles.set(oldRoles.map(r => r.id), 'Anti-nuke: Reverting unauthorized dangerous role grant').catch(err => {
                logger.error(`Failed to revert role grant for ${newMember.user.tag}: ${err.message}`);
              });
            }
            // Quarantine executor
            const roleNames = addedRoles.map(r => r.name).join(', ');
            await executeQuarantine(
              guild,
              executorId,
              'DANGEROUS_ROLE_GRANT',
              `Assigned roles with dangerous permissions to ${newMember.user.tag} (Roles: ${roleNames})`,
              entry.reason || undefined
            );
            return;
          }
        }
      }
    }
  }

  // 2. Check if a member was timed out (Mass Timeout Protection)
  const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
  const newTimeout = newMember.communicationDisabledUntilTimestamp;
  
  if (!oldTimeout && newTimeout) {
    // User was timed out
    const result = await getRecentExecutor(guild, AuditLogEvent.MemberUpdate, newMember.id);
    if (result) {
      const { id: executorId, entry } = result;
      if (!(await isImmune(guild, executorId))) {
        const settings = await GuildSettings.findOne({ guildId: guild.id });
        const rule = settings?.limits.memberKick; // We can group timeouts under memberKick limits or map to kick
        if (rule && rule.enabled) {
          const isLimited = rateLimiter.isRateLimited(
            guild.id,
            executorId,
            'memberKick', // Using kick limits as a proxy for mass kick/ban/timeout protection
            rule.limit,
            rule.window
          );
          if (isLimited) {
            await executeQuarantine(
              guild,
              executorId,
              'MASS_TIMEOUTS',
              `Timed out member: ${newMember.user.tag}. Rate limit exceeded.`,
              entry.reason || undefined
            );
          }
        }
      }
    }
  }
}

/**
 * Monitor Bot Additions (Unauthorized Bots Protection)
 */
export async function monitorBotAdd(member: GuildMember): Promise<void> {
  if (!member.user.bot) return;
  const { guild } = member;

  const result = await getRecentExecutor(guild, AuditLogEvent.BotAdd, member.id);
  if (!result) return;
  const { id: executorId, entry } = result;

  if (await isImmune(guild, executorId)) return;

  const settings = await GuildSettings.findOne({ guildId: guild.id });
  if (!settings?.limits.unauthorizedBotAdd.enabled) return;

  // Kick the unauthorized bot
  if (member.kickable) {
    await member.kick('Anti-nuke: Unauthorized bot addition').catch(err => {
      logger.error(`Failed to kick unauthorized bot ${member.user.tag}: ${err.message}`);
    });
  }

  // Quarantine the executor who invited the bot
  await executeQuarantine(
    guild,
    executorId,
    'UNAUTHORIZED_BOT_ADDITION',
    `Invited unauthorized bot: ${member.user.tag} (ID: ${member.id})`,
    entry.reason || undefined
  );
}

/**
 * Monitor Webhook Creation
 */
export async function monitorWebhookUpdate(channel: GuildChannel): Promise<void> {
  const { guild } = channel;
  if (!guild) return;

  const result = await getRecentExecutor(guild, AuditLogEvent.WebhookCreate);
  if (!result) return;
  const { id: executorId, entry } = result;

  if (await isImmune(guild, executorId)) return;

  const settings = await GuildSettings.findOne({ guildId: guild.id });
  if (!settings?.limits.dangerousWebhookCreate.enabled) return;

  // Attempt to delete the webhook using the ID from the audit log entry
  const webhookId = entry.targetId;
  if (webhookId) {
    const webhooks = await guild.fetchWebhooks().catch(() => null);
    const webhook = webhooks?.get(webhookId);
    if (webhook) {
      await webhook.delete('Anti-nuke: Unauthorized webhook creation').catch(err => {
        logger.error(`Failed to delete unauthorized webhook ${webhook.name}: ${err.message}`);
      });
    }
  }

  // Quarantine the creator
  await executeQuarantine(
    guild,
    executorId,
    'UNAUTHORIZED_WEBHOOK_CREATION',
    `Created webhook in channel <#${channel.id}>`,
    entry.reason || undefined
  );
}


/**
 * Monitor Guild Settings Update (Name, Icon, Banner, Vanity URL, etc.)
 */
export async function monitorGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
  const result = await getRecentExecutor(newGuild, AuditLogEvent.GuildUpdate);
  if (!result) return;
  const { id: executorId, entry } = result;

  if (await isImmune(newGuild, executorId)) return;

  // Check if critical settings changed
  const nameChanged = oldGuild.name !== newGuild.name;
  const iconChanged = oldGuild.icon !== newGuild.icon;
  const bannerChanged = oldGuild.banner !== newGuild.banner;
  const vanityChanged = oldGuild.vanityURLCode !== newGuild.vanityURLCode;
  const verificationChanged = oldGuild.verificationLevel !== newGuild.verificationLevel;

  if (nameChanged || iconChanged || bannerChanged || vanityChanged || verificationChanged) {
    const changes: string[] = [];
    if (nameChanged) changes.push(`Name: "${oldGuild.name}" -> "${newGuild.name}"`);
    if (iconChanged) changes.push('Server Icon');
    if (bannerChanged) changes.push('Server Banner');
    if (vanityChanged) changes.push(`Vanity URL: ${oldGuild.vanityURLCode} -> ${newGuild.vanityURLCode}`);
    if (verificationChanged) changes.push(`Verification: ${oldGuild.verificationLevel} -> ${newGuild.verificationLevel}`);

    // Quarantine the executor
    await executeQuarantine(
      newGuild,
      executorId,
      'GUILD_SETTINGS_UPDATE',
      `Modified critical server settings: ${changes.join(', ')}`,
      entry.reason || undefined
    );
  }
}

/**
 * Monitor Emojis & Stickers Deletion (Rate limited mass deletes)
 */
export async function monitorEmojiDelete(guild: Guild, emojiId: string, emojiName: string): Promise<void> {
  const result = await getRecentExecutor(guild, AuditLogEvent.EmojiDelete, emojiId);
  if (!result) return;
  const { id: executorId } = result;

  if (await isImmune(guild, executorId)) return;

  // We reuse role delete limits or a generic 5 actions in 10s rule for emoji/sticker deletion
  const isLimited = rateLimiter.isRateLimited(
    guild.id,
    executorId,
    'roleDelete', // Reuse roleDelete limit as a proxy for emoji deletion
    5,
    10
  );

  if (isLimited) {
    await executeQuarantine(
      guild,
      executorId,
      'MASS_EMOJI_DELETION',
      `Deleted emoji: :${emojiName}:`
    );
  }
}

export async function monitorStickerDelete(guild: Guild, stickerId: string, stickerName: string): Promise<void> {
  const result = await getRecentExecutor(guild, AuditLogEvent.StickerDelete, stickerId);
  if (!result) return;
  const { id: executorId } = result;

  if (await isImmune(guild, executorId)) return;

  const isLimited = rateLimiter.isRateLimited(
    guild.id,
    executorId,
    'roleDelete',
    5,
    10
  );

  if (isLimited) {
    await executeQuarantine(
      guild,
      executorId,
      'MASS_STICKER_DELETION',
      `Deleted sticker: ${stickerName}`
    );
  }
}

/**
 * Monitor Chat Messages: Message Spam, Mention Spam, Invite Spam
 */
export async function monitorMessageCreate(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const { guild, author, content } = message;

  // Bypass immune users
  if (await isImmune(guild, author.id)) return;

  const settings = await GuildSettings.findOne({ guildId: guild.id });
  if (!settings) return;

  // 1. Check Invite Spam
  const inviteRegex = /(discord\.(gg|io|me|li)\/.+|discord(app)?\.com\/invite\/.+)/i;
  if (inviteRegex.test(content)) {
    const rule = settings.limits.inviteSpam;
    if (rule.enabled) {
      const isLimited = rateLimiter.isRateLimited(guild.id, author.id, 'inviteSpam', rule.limit, rule.window);
      if (isLimited) {
        // Delete message and timeout attacker
        await message.delete().catch(() => null);
        const member = await guild.members.fetch(author.id).catch(() => null);
        if (member && member.moderatable) {
          await member.timeout(10 * 60 * 1000, 'Anti-nuke: Invite spam link rate limit exceeded').catch(() => null);
        }
        await executeQuarantine(
          guild,
          author.id,
          'INVITE_SPAM',
          `Sent multiple server invites exceeding limit (${rule.limit} in ${rule.window}s).`
        );
        return;
      }
    }
  }

  // 2. Check Mention Spam
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  const mentionRule = settings.limits.mentionSpam;
  if (mentionRule.enabled && mentionCount >= mentionRule.limit) {
    // Immediate quarantine if a single message has too many mentions, or check sliding window
    const isLimited = rateLimiter.isRateLimited(guild.id, author.id, 'mentionSpam', 3, 5); // e.g. 3 messages with mass mentions in 5s
    if (isLimited || mentionCount >= mentionRule.limit * 2) {
      await message.delete().catch(() => null);
      await executeQuarantine(
        guild,
        author.id,
        'MENTION_SPAM',
        `Mentioned ${mentionCount} users/roles in a message (Threshold: ${mentionRule.limit}).`
      );
      return;
    }
  }

  // 3. Check General Message Spam
  const spamRule = settings.limits.messageSpam;
  if (spamRule.enabled) {
    const isLimited = rateLimiter.isRateLimited(guild.id, author.id, 'messageSpam', spamRule.limit, spamRule.window);
    if (isLimited) {
      // Clean up last few messages
      await message.channel.messages.fetch({ limit: 10 }).then(async msgs => {
        const authorMsgs = msgs.filter(m => m.author.id === author.id);
        for (const m of authorMsgs.values()) {
          await m.delete().catch(() => null);
        }
      }).catch(() => null);

      await executeQuarantine(
        guild,
        author.id,
        'MESSAGE_SPAM',
        `Sent messages too quickly (Exceeded ${spamRule.limit} messages in ${spamRule.window}s).`
      );
    }
  }
}
