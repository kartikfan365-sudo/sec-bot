import { Schema, model, Document } from 'mongoose';

export interface ITemplate extends Document {
  guildId: string;
  templateId: string; // human readable identifier, e.g. "gaming-server"
  createdAt: Date;
  data: Record<string, any>;
}

const TemplateSchema = new Schema<ITemplate>({
  guildId: { type: String, required: true },
  templateId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  data: { type: Schema.Types.Mixed, required: true }
});

// Index to find templates for a specific guild
TemplateSchema.index({ guildId: 1, templateId: 1 }, { unique: true });

export const Template = model<ITemplate>('Template', TemplateSchema);
