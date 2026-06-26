import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  guildId: string;
  timestamp: Date;
  executorId: string;
  executorTag: string;
  action: string;
  targetId: string | null;
  targetName: string | null;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const AuditLogSchema = new Schema<IAuditLog>({
  guildId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  executorId: { type: String, required: true },
  executorTag: { type: String, required: true },
  action: { type: String, required: true },
  targetId: { type: String, default: null },
  targetName: { type: String, default: null },
  reason: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' }
});

AuditLogSchema.index({ guildId: 1, timestamp: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
