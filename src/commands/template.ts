import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType, TextChannel, ForumChannel, VoiceChannel, StageChannel, GuildChannel } from 'discord.js';
import { Command } from './commandInterface';
import { Template } from '../database/schemas/Template';
import { restoreServer } from '../restore/restoreService';
import { Embeds } from '../utils/embeds';
import { logger } from '../utils/logger';

export const templateCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('template')
    .setDescription('Manage server layouts and templates (Owner only)')
    .addSubcommand(sub =>
      sub
        .setName('save')
        .setDescription('Save the current server layout as a template')
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('Name of the template')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List all templates saved for this server')
    )
    .addSubcommand(sub =>
      sub
        .setName('apply')
        .setDescription('Apply a template to rebuild the server')
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('Name of the template to apply')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Delete a template')
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('Name of the template to delete')
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { guild, user } = interaction;
    if (!guild) return;

    // Owner protection gate
    if (user.id !== guild.ownerId) {
      await interaction.reply({
        embeds: [Embeds.error('Access Denied', 'Only the Server Owner can execute template commands.')],
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'save') {
        const name = interaction.options.getString('name', true).toLowerCase().replace(/[^a-z0-9-_]/g, '');
        
        if (!name) {
          await interaction.editReply({
            embeds: [Embeds.error('Invalid Name', 'Template name must contain alphanumeric characters, hyphens or underscores only.')]
          });
          return;
        }

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
          .sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0)) as GuildChannel[];

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

        const templateData = {
          name: guild.name,
          verificationLevel: guild.verificationLevel,
          roles: rolesBackup,
          channels: channelsBackup
        };

        // Save or update template
        await Template.findOneAndUpdate(
          { guildId: guild.id, templateId: name },
          { data: templateData, createdAt: new Date() },
          { upsert: true, new: true }
        );

        await interaction.editReply({
          embeds: [Embeds.success('Template Saved', `Successfully saved server template as **${name}**!`)]
        });

      } else if (subcommand === 'list') {
        const templates = await Template.find({ guildId: guild.id }).sort({ createdAt: -1 });

        if (templates.length === 0) {
          await interaction.editReply({
            embeds: [Embeds.info('No Templates Found', 'There are no templates saved for this server yet.')]
          });
          return;
        }

        const listContent = templates.map((t, idx) => 
          `${idx + 1}. **${t.templateId}** - Saved <t:${Math.floor(t.createdAt.getTime() / 1000)}:R>`
        ).join('\n');

        await interaction.editReply({
          embeds: [Embeds.info('Guild Templates List', `Showing templates saved for **${guild.name}**:\n\n${listContent}`)]
        });

      } else if (subcommand === 'apply') {
        const name = interaction.options.getString('name', true).toLowerCase();
        const template = await Template.findOne({ guildId: guild.id, templateId: name });

        if (!template) {
          await interaction.editReply({
            embeds: [Embeds.error('Template Not Found', `No template named **${name}** exists.`)]
          });
          return;
        }

        await interaction.editReply({
          embeds: [Embeds.warning(
            'Applying Template',
            `Initializing rebuild of server structure using template **${name}**.\nThis will clear current channels and roles. Progress updates will be sent to your DMs.`
          )]
        });

        const owner = await guild.fetchOwner().catch(() => null);
        if (owner) {
          await owner.send({
            embeds: [Embeds.info('Template Rebuild Initialized', `Starting template **${name}** application on **${guild.name}**.`)]
          }).catch(() => null);
        }

        const queue = restoreServer(guild, template.data as any);

        let lastDMSent = Date.now();
        queue.onProgress = (completed, total, currentTask) => {
          if (owner && (Date.now() - lastDMSent > 4000 || completed === total)) {
            const percent = Math.floor((completed / total) * 100);
            owner.send({
              embeds: [Embeds.info(
                `Template Progress: ${percent}%`,
                `Completed **${completed}/${total}** tasks.\nRebuilding: \`${currentTask}\``
              )]
            }).catch(() => null);
            lastDMSent = Date.now();
          }
        };

        queue.onComplete = () => {
          if (owner) {
            owner.send({
              embeds: [Embeds.success('Template Rebuild Complete', `Successfully applied template **${name}** to **${guild.name}**!`)]
            }).catch(() => null);
          }
        };

        queue.onError = (err) => {
          if (owner) {
            owner.send({
              embeds: [Embeds.error('Template Rebuild Failed', `Failed to apply template:\n\`\`\`${err.message}\`\`\``)]
            }).catch(() => null);
          }
        };

      } else if (subcommand === 'delete') {
        const name = interaction.options.getString('name', true).toLowerCase();
        const result = await Template.deleteOne({ guildId: guild.id, templateId: name });

        if (result.deletedCount === 0) {
          await interaction.editReply({
            embeds: [Embeds.error('Template Not Found', `No template named **${name}** exists.`)]
          });
        } else {
          await interaction.editReply({
            embeds: [Embeds.success('Template Deleted', `Successfully deleted template **${name}**.`)]
          });
        }
      }
    } catch (error: any) {
      logger.error(`Error in /template command: ${error.message}`);
      await interaction.editReply({
        embeds: [Embeds.error('Command Error', 'An unexpected error occurred while executing the template command.')]
      });
    }
  }
};
