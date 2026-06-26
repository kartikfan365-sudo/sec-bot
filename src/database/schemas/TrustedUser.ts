import { Schema, model, Document } from 'mongoose';

export interface ITrustedUser extends Document {
  guildId: string;
  userId: string;
  username: string;
  addedBy: string;
  addedAt: Date;
}

const TrustedUserSchema = new Schema<ITrustedUser>({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  addedBy: { type: String, required: true },
  addedAt: { type: Date, default: Date.now }
});

// Compound index to guarantee uniqueness of user per guild
TrustedUserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export const TrustedUser = model<ITrustedUser>('TrustedUser', TrustedUserSchema);
