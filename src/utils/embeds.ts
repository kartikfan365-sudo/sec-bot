import { EmbedBuilder } from 'discord.js';

export class Embeds {
  public static error(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(`❌ ${title}`)
      .setDescription(description)
      .setColor(0xEF4444) // Sleek red
      .setTimestamp();
  }

  public static success(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(`✅ ${title}`)
      .setDescription(description)
      .setColor(0x10B981) // Modern green
      .setTimestamp();
  }

  public static info(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(`ℹ️ ${title}`)
      .setDescription(description)
      .setColor(0x3B82F6) // Bright blue
      .setTimestamp();
  }

  public static warning(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(`⚠️ ${title}`)
      .setDescription(description)
      .setColor(0xF59E0B) // Amber yellow
      .setTimestamp();
  }

  public static securityAlert(data: {
    guildName: string;
    attackerTag: string;
    attackerId: string;
    action: string;
    details: string;
    timestamp: Date;
    auditLogReason?: string;
  }): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('🚨 SECURITY ALERT: ANTI-NUKE TRIGGERED')
      .setDescription(`A critical security event was detected and handled automatically on **${data.guildName}**.`)
      .setColor(0xDC2626) // Crimson Red
      .addFields(
        { name: 'Attacker', value: `${data.attackerTag} (ID: ${data.attackerId})`, inline: true },
        { name: 'Action Detected', value: data.action, inline: true },
        { name: 'Details', value: data.details },
        { name: 'Resolution', value: '🛡️ Stripped all roles containing dangerous permissions and applied a 24h timeout.' }
      )
      .setThumbnail('https://i.imgur.com/8Q5N8mB.png') // A security shield placeholder or similar
      .setFooter({ text: 'Discord Security Bot' })
      .setTimestamp(data.timestamp);

    if (data.auditLogReason) {
      embed.addFields({ name: 'Audit Log Reason', value: data.auditLogReason });
    }

    return embed;
  }
}
