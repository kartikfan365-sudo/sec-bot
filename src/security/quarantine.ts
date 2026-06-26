import { Guild, Client, PermissionsBitField, ChannelType } from 'discord.js';
import { GuildSettings } from '../database/schemas/GuildSettings';
import { AuditLog } from '../database/schemas/AuditLog';
import { Embeds } from '../utils/embeds';
import { logger } from '../utils/logger';

/**
 * Quarantines an attacker by stripping their roles and placing them on timeout.
 * @param guild The guild where the attack occurred
 * @param attackerId The Discord ID of the attacker
 * @param action The action that triggered the anti-nuke system
 * @param details Additional details of the incident
 * @param auditReason Reason extracted from Discord audit logs, if any
 */
export async function executeQuarantine(
  guild: Guild,
  attackerId: string,
  action: string,
  details: string,
  auditReason?: string
): Promise<void> {
  try {
    // 1. Fetch attacker
    const member = await guild.members.fetch(attackerId).catch(() => null);
    if (!member) {
      logger.warn(`Could not find member ${attackerId} in guild ${guild.id} to quarantine.`);
      return;
    }

    // Server owner cannot be quarantined
    if (guild.ownerId === attackerId) {
      logger.warn(`Attempted to quarantine server owner ${attackerId} on guild ${guild.id}. Aborting.`);
      return;
    }

    // 2. Fetch bot member to check permissions
    const botMember = guild.members.me;
    if (!botMember) {
      logger.error(`Bot member object is missing in guild ${guild.id}.`);
      return;
    }

    // 3. Log current roles for restoration later
    const previousRoles = member.roles.cache
      .filter(role => role.id !== guild.roles.everyone.id && !role.managed)
      .map(role => role.id);

    logger.info(`Quarantining member ${member.user.tag} (${attackerId}) in guild ${guild.id}. Previous roles: ${previousRoles.join(', ')}`);

    // 4. Strip roles containing dangerous permissions
    // To be absolutely secure, we strip all non-managed roles.
    let rolesStripped = false;
    if (member.manageable) {
      await member.roles.set([]).catch(err => {
        logger.error(`Failed to strip roles from attacker ${attackerId}: ${err.message}`);
      });
      rolesStripped = true;
    } else {
      logger.error(`Cannot manage roles for attacker ${attackerId}. Is their role higher than the bot's?`);
    }

    // 5. Apply timeout (24 hours) to prevent any other interaction
    let timeoutApplied = false;
    if (member.moderatable) {
      await member.timeout(24 * 60 * 60 * 1000, `Anti-Nuke Triggered: ${action}`).catch(err => {
        logger.error(`Failed to timeout attacker ${attackerId}: ${err.message}`);
      });
      timeoutApplied = true;
    } else {
      logger.error(`Cannot apply timeout to attacker ${attackerId}.`);
    }

    // 6. Write to AuditLog database
    const auditRecord = await AuditLog.create({
      guildId: guild.id,
      timestamp: new Date(),
      executorId: botMember.id,
      executorTag: botMember.user.tag,
      action: 'QUARANTINE',
      targetId: attackerId,
      targetName: member.user.tag,
      reason: `Anti-Nuke Triggered: ${action}. Details: ${details}. Roles stripped: ${rolesStripped}. Timeout applied: ${timeoutApplied}. Saved roles: [${previousRoles.join(', ')}]`,
      severity: 'critical'
    });

    // 7. Send Security Alert Embed to configured log channel
    const settings = await GuildSettings.findOne({ guildId: guild.id });
    const embed = Embeds.securityAlert({
      guildName: guild.name,
      attackerTag: member.user.tag,
      attackerId: attackerId,
      action: action,
      details: details,
      timestamp: new Date(),
      auditLogReason: auditReason
    });

    if (settings?.loggingChannelId) {
      const logChannel = await guild.channels.fetch(settings.loggingChannelId).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({ embeds: [embed] }).catch(err => {
          logger.error(`Failed to send security alert to log channel: ${err.message}`);
        });
      }
    }

    // 8. DM Owner
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) {
      await owner.send({
        content: `🚨 **Critical Security Action Alert!**`,
        embeds: [embed]
      }).catch(err => {
        logger.error(`Failed to DM server owner ${owner.id}: ${err.message}`);
      });
    }

  } catch (error: any) {
    logger.error(`Error executing quarantine: ${error.message}`, error);
  }
}
