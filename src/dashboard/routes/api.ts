import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { GuildSettings } from '../../database/schemas/GuildSettings';
import { TrustedUser } from '../../database/schemas/TrustedUser';
import { Backup } from '../../database/schemas/Backup';
import { Template } from '../../database/schemas/Template';
import { AuditLog } from '../../database/schemas/AuditLog';
import { createBackup } from '../../backup/backupService';
import { restoreServer } from '../../restore/restoreService';
import { logger } from '../../utils/logger';
import crypto from 'crypto';

const router = Router();

// ==========================================
// MIDDLEWARES
// ==========================================

function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

async function isGuildOwner(req: Request, res: Response, next: NextFunction) {
  const { guildId } = req.params;
  const guild = req.client.guilds.cache.get(guildId);
  if (!guild) {
    return res.status(404).json({ error: 'Guild not found or bot is not in this guild.' });
  }

  // Only the owner of the guild can perform dashboard actions
  if (guild.ownerId !== (req.user as any).id) {
    return res.status(403).json({ error: 'Access Denied. Only the server owner can manage settings.' });
  }
  next();
}

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

// Login with Discord
router.get('/auth/login', passport.authenticate('discord'));

// Discord OAuth callback redirect
router.get('/auth/callback', passport.authenticate('discord', {
  failureRedirect: '/login'
}), (req: Request, res: Response) => {
  // Redirect to dashboard home page
  res.redirect('/');
});

// Get current user profile
router.get('/auth/me', isAuthenticated, (req: Request, res: Response) => {
  res.status(200).json(req.user);
});

// Logout session
router.get('/auth/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      logger.error(`Error during logout: ${err.message}`);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.status(200).json({ success: true });
  });
});

// ==========================================
// GUILDS ENDPOINTS
// ==========================================

// Get all guilds where bot is present AND user is the owner
router.get('/guilds', isAuthenticated, (req: Request, res: Response) => {
  try {
    const userGuilds = (req.user as any).guilds || [];
    
    // Filter guilds where user owns and bot is in
    const filteredGuilds = userGuilds
      .filter((g: any) => g.owner === true)
      .map((g: any) => {
        const botGuild = req.client.guilds.cache.get(g.id);
        return {
          id: g.id,
          name: g.name,
          icon: g.icon,
          botPresent: !!botGuild,
          memberCount: botGuild?.memberCount || 0
        };
      })
      .filter((g: any) => g.botPresent); // Only show guilds where bot is active

    res.status(200).json(filteredGuilds);
  } catch (error: any) {
    logger.error(`Failed to fetch user guilds: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve guilds' });
  }
});

// Get detailed guild info
router.get('/guilds/:guildId', isAuthenticated, isGuildOwner, (req: Request, res: Response) => {
  const guild = req.client.guilds.cache.get(req.params.guildId)!;
  res.status(200).json({
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL({ forceStatic: false }),
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
    channelsCount: guild.channels.cache.size,
    rolesCount: guild.roles.cache.size
  });
});

// ==========================================
// SECURITY CONFIGURATION & LOGS
// ==========================================

// Get security settings
router.get('/guilds/:guildId/settings', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    let settings = await GuildSettings.findOne({ guildId: req.params.guildId });
    if (!settings) {
      settings = await GuildSettings.create({ guildId: req.params.guildId });
    }
    
    // Get text channels to populate logging selection in dashboard UI
    const guild = req.client.guilds.cache.get(req.params.guildId)!;
    const channels = guild.channels.cache
      .filter(ch => ch.type === 0) // Text channels
      .map(ch => ({ id: ch.id, name: ch.name }));

    res.status(200).json({ settings, channels });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update security settings
router.post('/guilds/:guildId/settings', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const { limits, loggingChannelId, backupRetentionDays, autoBackupInterval } = req.body;
    
    const settings = await GuildSettings.findOneAndUpdate(
      { guildId: req.params.guildId },
      { limits, loggingChannelId, backupRetentionDays, autoBackupInterval },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch guild audit logs (recent security alerts)
router.get('/guilds/:guildId/logs', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const logs = await AuditLog.find({ guildId: req.params.guildId })
      .sort({ timestamp: -1 })
      .limit(100);
    res.status(200).json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// TRUSTED USERS ENDPOINTS
// ==========================================

// Get trusted users list
router.get('/guilds/:guildId/trusted', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const trusted = await TrustedUser.find({ guildId: req.params.guildId });
    res.status(200).json(trusted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add trusted user
router.post('/guilds/:guildId/trusted', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    const guild = req.client.guilds.cache.get(req.params.guildId)!;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.status(404).json({ error: 'User is not a member of this server.' });
    }

    const existing = await TrustedUser.findOne({ guildId: guild.id, userId });
    if (existing) {
      return res.status(400).json({ error: 'User is already trusted.' });
    }

    const trusted = await TrustedUser.create({
      guildId: guild.id,
      userId,
      username: member.user.tag,
      addedBy: (req.user as any).username
    });

    res.status(201).json(trusted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove trusted user
router.delete('/guilds/:guildId/trusted/:userId', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const result = await TrustedUser.deleteOne({
      guildId: req.params.guildId,
      userId: req.params.userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found in trusted list.' });
    }
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// BACKUPS ENDPOINTS
// ==========================================

// Get backups list
router.get('/guilds/:guildId/backups', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const backups = await Backup.find({ guildId: req.params.guildId }).sort({ createdAt: -1 });
    res.status(200).json(backups);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger backup creation
router.post('/guilds/:guildId/backups', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const guild = req.client.guilds.cache.get(req.params.guildId)!;
    const backup = await createBackup(guild, 'manual');
    res.status(201).json(backup);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger backup restore
router.post('/guilds/:guildId/backups/:backupId/restore', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const { guildId, backupId } = req.params;
    const guild = req.client.guilds.cache.get(guildId)!;

    const backup = await Backup.findOne({ guildId, backupId });
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // Initialize restore asynchronously in background queue
    restoreServer(guild, backup.data as any);

    res.status(200).json({ success: true, message: 'Server restore initiated in background.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Download backup JSON file
router.get('/guilds/:guildId/backups/:backupId/download', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const { guildId, backupId } = req.params;
    const backup = await Backup.findOne({ guildId, backupId });
    
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup-${guildId}-${backupId}.json`);
    res.status(200).send(JSON.stringify(backup.data, null, 2));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Upload backup JSON file
router.post('/guilds/:guildId/backups/upload', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const { backupJson } = req.body;
    const guildId = req.params.guildId;

    let parsedData: any;
    try {
      parsedData = typeof backupJson === 'object' ? backupJson : JSON.parse(backupJson);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON string format' });
    }

    // Basic structure validation
    if (!parsedData.name || !Array.isArray(parsedData.roles) || !Array.isArray(parsedData.channels)) {
      return res.status(400).json({ error: 'Uploaded JSON is missing required server backup fields (name, roles, channels).' });
    }

    const backupId = crypto.randomUUID();
    const backup = await Backup.create({
      guildId,
      backupId,
      createdAt: new Date(),
      type: 'manual',
      data: parsedData
    });

    res.status(201).json(backup);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// TEMPLATES ENDPOINTS
// ==========================================

// Get templates
router.get('/guilds/:guildId/templates', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const templates = await Template.find({ guildId: req.params.guildId }).sort({ createdAt: -1 });
    res.status(200).json(templates);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save template
router.post('/guilds/:guildId/templates', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const { templateId, data } = req.body;
    const name = templateId.toLowerCase().replace(/[^a-z0-9-_]/g, '');

    if (!name) {
      return res.status(400).json({ error: 'Template name must be alphanumeric.' });
    }

    let templateData = data;

    if (!templateData) {
      const guild = req.client.guilds.cache.get(req.params.guildId)!;
      const { ChannelType } = require('discord.js');

      // Fetch and map roles
      const rolesBackup: any[] = [];
      const roles = await guild.roles.fetch();
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
          icon: role.iconURL()
        });
      }

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

      // Fetch and map channels
      const channelsBackup: any[] = [];
      const channels = await guild.channels.fetch();
      const sortedChannels = Array.from(channels.values())
        .filter(ch => ch !== null)
        .sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));

      for (const channel of sortedChannels) {
        if (!channel) continue;

        const parentChannel = channel.parent;
        const parentName = parentChannel ? parentChannel.name : null;

        const permissionOverwrites: any[] = [];
        for (const overwrite of channel.permissionOverwrites.cache.values()) {
          let typeStr: 'role' | 'member' = overwrite.type === 0 ? 'role' : 'member';
          let roleName: string | undefined;

          if (typeStr === 'role') {
            const roleObj = guild.roles.cache.get(overwrite.id);
            roleName = roleObj ? roleObj.name : undefined;
          }

          permissionOverwrites.push({
            id: overwrite.id,
            type: typeStr,
            name: roleName,
            allow: overwrite.allow.bitfield.toString(),
            deny: overwrite.deny.bitfield.toString()
          });
        }

        let topic: string | null = null;
        let nsfw = false;
        let slowmode = 0;
        let bitrate: number | null = null;
        let userLimit: number | null = null;
        let autoArchiveDuration: number | null = null;

        if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildForum) {
          const txt = channel as any;
          topic = txt.topic || null;
          nsfw = txt.nsfw || false;
          slowmode = txt.rateLimitPerUser || 0;
          autoArchiveDuration = txt.defaultAutoArchiveDuration || null;
        } else if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
          const vc = channel as any;
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

      templateData = {
        name: guild.name,
        verificationLevel: guild.verificationLevel,
        roles: rolesBackup,
        channels: channelsBackup
      };
    }

    const template = await Template.findOneAndUpdate(
      { guildId: req.params.guildId, templateId: name },
      { data: templateData, createdAt: new Date() },
      { upsert: true, new: true }
    );

    res.status(201).json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// Apply template
router.post('/guilds/:guildId/templates/:templateId/apply', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const { guildId, templateId } = req.params;
    const guild = req.client.guilds.cache.get(guildId)!;

    const template = await Template.findOne({ guildId, templateId });
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Apply template asynchronously in background queue
    restoreServer(guild, template.data as any);

    res.status(200).json({ success: true, message: 'Template application initiated.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete template
router.delete('/guilds/:guildId/templates/:templateId', isAuthenticated, isGuildOwner, async (req: Request, res: Response) => {
  try {
    const result = await Template.deleteOne({
      guildId: req.params.guildId,
      templateId: req.params.templateId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
