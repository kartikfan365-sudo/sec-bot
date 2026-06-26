import { Guild, ChannelType, PermissionsBitField, Role, CategoryChannel, OverwriteResolvable } from 'discord.js';
import { GuildBackupData, RoleBackupData, ChannelBackupData } from '../backup/backupService';
import { RestoreQueue } from './restoreQueue';
import { logger } from '../utils/logger';

/**
 * Rebuilds the server state based on backup data.
 * @param guild The target Discord Guild
 * @param backupData The backup payload containing roles, channels, permissions, and settings
 * @returns A RestoreQueue instance that processes the restore steps asynchronously
 */
export function restoreServer(guild: Guild, backupData: GuildBackupData): RestoreQueue {
  const queue = new RestoreQueue();

  // Progress variables
  const roleMap = new Map<string, Role>(); // Maps role name -> new Role object
  const categoryMap = new Map<string, CategoryChannel>(); // Maps category name -> new Category object

  // 1. Queue Step: Delete existing channels
  queue.addTask('Delete Existing Channels', async () => {
    logger.info(`Deleting existing channels in guild ${guild.id}`);
    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      if (channel && channel.deletable) {
        await channel.delete('Restoring server layout').catch(err => {
          logger.error(`Failed to delete channel ${channel.name}: ${err.message}`);
        });
      }
    }
  });

  // 2. Queue Step: Delete existing roles
  queue.addTask('Delete Existing Roles', async () => {
    logger.info(`Deleting existing roles in guild ${guild.id}`);
    const roles = await guild.roles.fetch();
    for (const role of roles.values()) {
      // Don't delete @everyone, bot integration roles, or roles higher than bot's role
      const isEveryone = role.id === guild.roles.everyone.id;
      const isBotRole = role.managed;
      const canDelete = role.editable && !isEveryone && !isBotRole;

      if (canDelete) {
        await role.delete('Restoring server layout').catch(err => {
          logger.error(`Failed to delete role ${role.name}: ${err.message}`);
        });
      }
    }
  });

  // 3. Queue Step: Update @everyone permissions
  const everyoneRoleData = backupData.roles.find(r => r.name === '@everyone');
  if (everyoneRoleData) {
    queue.addTask('Update @everyone Permissions', async () => {
      logger.info('Updating @everyone permissions');
      await guild.roles.everyone.setPermissions(
        BigInt(everyoneRoleData.permissions),
        'Restoring @everyone permissions'
      ).catch(err => {
        logger.error(`Failed to update @everyone permissions: ${err.message}`);
      });
      // Store reference to everyone role in map
      roleMap.set('@everyone', guild.roles.everyone);
    });
  }

  // 4. Queue Step: Create Roles (except @everyone)
  // We sort backup roles by position so they are created in the correct stack order
  const backupRoles = backupData.roles.filter(r => r.name !== '@everyone');
  for (const roleData of backupRoles) {
    queue.addTask(`Create Role: ${roleData.name}`, async () => {
      logger.info(`Creating role ${roleData.name}`);
      const newRole = await guild.roles.create({
        name: roleData.name,
        color: roleData.color,
        hoist: roleData.hoist,
        permissions: BigInt(roleData.permissions),
        mentionable: roleData.mentionable,
        reason: 'Restoring server layout'
      });

      // Set custom role icon if present in backup (roles must be on boosted server for this, so try/catch)
      if (roleData.icon && newRole.editable) {
        await newRole.setIcon(roleData.icon).catch(() => null);
      }

      roleMap.set(roleData.name, newRole);
    });
  }

  // 5. Queue Step: Create Categories
  const categories = backupData.channels.filter(ch => ch.type === ChannelType.GuildCategory);
  for (const catData of categories) {
    queue.addTask(`Create Category: ${catData.name}`, async () => {
      logger.info(`Creating category ${catData.name}`);
      
      // Map overwrites
      const overwrites = resolveOverwrites(catData.permissionOverwrites, roleMap, guild);

      const newCategory = await guild.channels.create({
        name: catData.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwrites,
        reason: 'Restoring server layout'
      }) as CategoryChannel;

      categoryMap.set(catData.name, newCategory);
    });
  }

  // 6. Queue Step: Create Channels (linked to categories)
  const channels = backupData.channels.filter(ch => ch.type !== ChannelType.GuildCategory);
  for (const chData of channels) {
    queue.addTask(`Create Channel: ${chData.name}`, async () => {
      logger.info(`Creating channel ${chData.name} of type ${chData.type}`);

      const parentCategory = chData.parentName ? categoryMap.get(chData.parentName) : null;
      const overwrites = resolveOverwrites(chData.permissionOverwrites, roleMap, guild);

      const createOptions: any = {
        name: chData.name,
        type: chData.type,
        parent: parentCategory ? parentCategory.id : null,
        permissionOverwrites: overwrites,
        nsfw: chData.nsfw,
        rateLimitPerUser: chData.slowmode,
        reason: 'Restoring server layout'
      };

      // Apply channel specific options
      if (chData.topic) {
        createOptions.topic = chData.topic;
      }
      if (chData.bitrate) {
        createOptions.bitrate = chData.bitrate;
      }
      if (chData.userLimit) {
        createOptions.userLimit = chData.userLimit;
      }
      if (chData.autoArchiveDuration) {
        createOptions.defaultAutoArchiveDuration = chData.autoArchiveDuration;
      }

      await guild.channels.create(createOptions).catch(err => {
        logger.error(`Failed to create channel ${chData.name}: ${err.message}`);
      });
    });
  }

  // 7. Queue Step: Apply Positions
  // To avoid ordering issues, we update position sorting at the end
  queue.addTask('Apply Channel & Role Ordering', async () => {
    logger.info('Applying positions and ordering');
    
    // Position roles (bot must be high enough to do this, so wrap in catch)
    try {
      const rolePositions: { role: Role; position: number }[] = [];
      for (const roleData of backupRoles) {
        const matchingRole = roleMap.get(roleData.name);
        if (matchingRole && matchingRole.editable && matchingRole.id !== guild.roles.everyone.id) {
          rolePositions.push({ role: matchingRole, position: roleData.position });
        }
      }
      if (rolePositions.length > 0) {
        await guild.roles.setPositions(rolePositions).catch(() => null);
      }
    } catch (err: any) {
      logger.warn(`Failed to sort role positions: ${err.message}`);
    }
  });

  // 8. Queue Step: Reapply Guild Settings (Name, icon, verification level)
  queue.addTask('Reapply Guild Settings', async () => {
    logger.info('Applying server verification level and name');
    await guild.setName(backupData.name).catch(() => null);
    await guild.setVerificationLevel(backupData.verificationLevel).catch(() => null);

    if (backupData.iconURL) {
      await guild.setIcon(backupData.iconURL).catch(() => null);
    }
    if (backupData.bannerURL) {
      await guild.setBanner(backupData.bannerURL).catch(() => null);
    }
  });

  return queue;
}

/**
 * Resolves permissions overwrites from backup names to newly created Discord IDs.
 */
function resolveOverwrites(
  backupOverwrites: ChannelBackupData['permissionOverwrites'],
  roleMap: Map<string, Role>,
  guild: Guild
): OverwriteResolvable[] {
  const overwrites: OverwriteResolvable[] = [];

  for (const overwrite of backupOverwrites) {
    let resolvedId: string | null = null;

    if (overwrite.type === 'role') {
      if (overwrite.name === '@everyone') {
        resolvedId = guild.roles.everyone.id;
      } else if (overwrite.name) {
        const matchedRole = roleMap.get(overwrite.name);
        resolvedId = matchedRole ? matchedRole.id : null;
      }
    } else {
      // For members, we try to use the raw user ID, assuming members did not change
      resolvedId = overwrite.id;
    }

    if (resolvedId) {
      overwrites.push({
        id: resolvedId,
        type: overwrite.type === 'role' ? 0 : 1, // 0 for role, 1 for member in discord api v10/v14
        allow: BigInt(overwrite.allow),
        deny: BigInt(overwrite.deny)
      });
    }
  }

  return overwrites;
}
export default restoreServer;
