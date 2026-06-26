import { Schema, model, Document } from 'mongoose';

export interface ISecurityLimit {
  limit: number;
  window: number; // in seconds
  enabled: boolean;
}

export interface IGuildSettings extends Document {
  guildId: string;
  loggingChannelId: string | null;
  backupRetentionDays: number;
  autoBackupInterval: 'hourly' | 'daily' | 'disabled';
  limits: {
    channelDelete: ISecurityLimit;
    roleDelete: ISecurityLimit;
    channelCreate: ISecurityLimit;
    roleCreate: ISecurityLimit;
    memberBan: ISecurityLimit;
    memberKick: ISecurityLimit;
    messageSpam: ISecurityLimit;
    mentionSpam: ISecurityLimit;
    inviteSpam: ISecurityLimit;
    dangerousPermissionGrant: { enabled: boolean };
    unauthorizedBotAdd: { enabled: boolean };
    dangerousWebhookCreate: { enabled: boolean };
  };
}

const securityLimitSchema = new Schema<ISecurityLimit>({
  limit: { type: Number, required: true },
  window: { type: Number, required: true }, // in seconds
  enabled: { type: Boolean, default: true }
}, { _id: false });

const GuildSettingsSchema = new Schema<IGuildSettings>({
  guildId: { type: String, required: true, unique: true },
  loggingChannelId: { type: String, default: null },
  backupRetentionDays: { type: Number, default: 30 },
  autoBackupInterval: { type: String, enum: ['hourly', 'daily', 'disabled'], default: 'daily' },
  limits: {
    channelDelete: { type: securityLimitSchema, default: { limit: 3, window: 5, enabled: true } },
    roleDelete: { type: securityLimitSchema, default: { limit: 5, window: 10, enabled: true } },
    channelCreate: { type: securityLimitSchema, default: { limit: 10, window: 10, enabled: true } },
    roleCreate: { type: securityLimitSchema, default: { limit: 10, window: 10, enabled: true } },
    memberBan: { type: securityLimitSchema, default: { limit: 5, window: 10, enabled: true } },
    memberKick: { type: securityLimitSchema, default: { limit: 5, window: 10, enabled: true } },
    messageSpam: { type: securityLimitSchema, default: { limit: 5, window: 3, enabled: true } },
    mentionSpam: { type: securityLimitSchema, default: { limit: 4, window: 3, enabled: true } },
    inviteSpam: { type: securityLimitSchema, default: { limit: 3, window: 5, enabled: true } },
    dangerousPermissionGrant: {
      type: new Schema({ enabled: { type: Boolean, default: true } }, { _id: false }),
      default: { enabled: true }
    },
    unauthorizedBotAdd: {
      type: new Schema({ enabled: { type: Boolean, default: true } }, { _id: false }),
      default: { enabled: true }
    },
    dangerousWebhookCreate: {
      type: new Schema({ enabled: { type: Boolean, default: true } }, { _id: false }),
      default: { enabled: true }
    }
  }
});

export const GuildSettings = model<IGuildSettings>('GuildSettings', GuildSettingsSchema);
