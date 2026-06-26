import { Guild, ChannelType, GuildChannel, Role, ForumChannel, TextChannel, VoiceChannel, StageChannel } from 'discord.js';
import { Backup, IBackup } from '../database/schemas/Backup';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface RoleBackupData {
  name: string;
  color: number;
  hoist: boolean;
  position: number;
  permissions: string; // Bitfield string
  mentionable: boolean;
  icon: string | null; // Base64 or URL if custom role icon
}

export interface OverwriteBackupData {
  id: string; // Original ID
  type: 'role' | 'member';
  name?: string; // Role name if role type, to resolve after restore
  allow: string; // Bitfield string
  deny: string; // Bitfield string
}

export interface ChannelBackupData {
  name: string;
  type: ChannelType;
  position: number;
  parentName: string | null; // Parent category name, to resolve after restore
  topic: string | null;
  nsfw: boolean;
  slowmode: number;
  bitrate: number | null; // For voice channels
  userLimit: number | null; // For voice channels
  autoArchiveDuration: number | null; // For threads / text channels
  permissionOverwrites: OverwriteBackupData[];
}

export interface GuildBackupData {
  name: string;
  iconURL: string | null;
  bannerURL: string | null;
  verificationLevel: number;
  roles: RoleBackupData[];
  channels: ChannelBackupData[];
}

/**
 * Creates a full backup of a Discord Guild and saves it to the database.
 */
export async function createBackup(
  guild: Guild,
  type: 'manual' | 'hourly' | 'daily'
): Promise<IBackup> {
  try {
    logger.info(`Creating ${type} backup for guild: ${guild.name} (${guild.id})`);

    // 1. Backup Roles (filter out the @everyone role because it cannot be created anew, and managed roles like bot integration roles)
    const rolesBackup: RoleBackupData[] = [];
    const roles = await guild.roles.fetch();
    
    // Sort roles by position to maintain order
    const sortedRoles = Array.from(roles.values())
      .filter(role => !role.managed && role.id !== guild.roles.everyone.id)
      .sort((a, b) => a.position - b.position);

    for (const role of sortedRoles) {
      rolesBackup.push({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        mentionable: role.mentionable,
        icon: role.iconURL() // Retrieve role icon URL
      });
    }

    // Include the @everyone role permissions in a special place or as a special role
    const everyoneRole = guild.roles.everyone;
    rolesBackup.unshift({
      name: '@everyone',
      color: everyoneRole.color,
      hoist: everyoneRole.hoist,
      position: 0,
      permissions: everyoneRole.permissions.bitfield.toString(),
      mentionable: everyoneRole.mentionable,
      icon: null
    });

    // 2. Backup Channels & Categories
    const channelsBackup: ChannelBackupData[] = [];
    const channels = await guild.channels.fetch();

    // Sort channels by position
    const sortedChannels = Array.from(channels.values())
      .filter(ch => ch !== null)
      .sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0)) as GuildChannel[];

    for (const channel of sortedChannels) {
      if (!channel) continue;
      
      // We skip threads during restore, but we can back up their metadata.
      // The prompt asks to back up Forum Channels, Threads, Voice Channels, Stage Channels, Announcements.
      // But we restore: Categories, Channels, Roles, Permissions, Positions, Overwrites, Server Settings.
      // Let's capture the structure.
      const parentChannel = channel.parent;
      const parentName = parentChannel ? parentChannel.name : null;

      // Extract permission overwrites, map role IDs to role names
      const permissionOverwrites: OverwriteBackupData[] = [];
      for (const overwrite of channel.permissionOverwrites.cache.values()) {
        let typeStr: 'role' | 'member' = overwrite.type === 0 ? 'role' : 'member';
        let name: string | undefined;

        if (typeStr === 'role') {
          const roleObj = guild.roles.cache.get(overwrite.id);
          name = roleObj ? roleObj.name : undefined;
        }

        permissionOverwrites.push({
          id: overwrite.id,
          type: typeStr,
          name,
          allow: overwrite.allow.bitfield.toString(),
          deny: overwrite.deny.bitfield.toString()
        });
      }

      // Read channel type specific properties
      let topic: string | null = null;
      let nsfw = false;
      let slowmode = 0;
      let bitrate: number | null = null;
      let userLimit: number | null = null;
      let autoArchiveDuration: number | null = null;

      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildForum) {
        const txt = channel as TextChannel | ForumChannel;
        topic = 'topic' in txt ? txt.topic : null;
        nsfw = 'nsfw' in txt ? txt.nsfw : false;
        slowmode = 'rateLimitPerUser' in txt ? (txt.rateLimitPerUser ?? 0) : 0;
        autoArchiveDuration = 'defaultAutoArchiveDuration' in txt ? (txt.defaultAutoArchiveDuration ?? null) : null;
      } else if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
        const vc = channel as VoiceChannel | StageChannel;
        bitrate = vc.bitrate;
        userLimit = vc.userLimit;
      }

      channelsBackup.push({
        name: channel.name,
        type: channel.type,
        position: channel.position,
        parentName,
        topic,
        nsfw,
        slowmode,
        bitrate,
        userLimit,
        autoArchiveDuration,
        permissionOverwrites
      });
    }

    // 3. Assemble and Create Database Entry
    const backupData: GuildBackupData = {
      name: guild.name,
      iconURL: guild.iconURL({ forceStatic: false }),
      bannerURL: guild.bannerURL({ forceStatic: false }),
      verificationLevel: guild.verificationLevel,
      roles: rolesBackup,
      channels: channelsBackup
    };

    const backupId = crypto.randomUUID();

    const backup = await Backup.create({
      guildId: guild.id,
      backupId,
      createdAt: new Date(),
      type,
      data: backupData
    });

    logger.info(`Backup successfully created! ID: ${backupId} for Guild: ${guild.name}`);
    return backup;
  } catch (error: any) {
    logger.error(`Failed to create backup for guild ${guild.id}: ${error.message}`, error);
    throw error;
  }
}
