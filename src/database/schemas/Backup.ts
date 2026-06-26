import { Schema, model, Document } from 'mongoose';

export interface IBackup extends Document {
  guildId: string;
  backupId: string;
  createdAt: Date;
  type: 'manual' | 'hourly' | 'daily';
  data: Record<string, any>;
}

const BackupSchema = new Schema<IBackup>({
  guildId: { type: String, required: true },
  backupId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  type: { type: String, enum: ['manual', 'hourly', 'daily'], required: true },
  data: { type: Schema.Types.Mixed, required: true }
});

// Index by guildId and createdAt for quick retrieval of latest backups
BackupSchema.index({ guildId: 1, createdAt: -1 });

export const Backup = model<IBackup>('Backup', BackupSchema);
