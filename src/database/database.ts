import mongoose from 'mongoose';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export async function connectDatabase(): Promise<void> {
  try {
    mongoose.connection.on('connected', () => {
      logger.info('Connected to MongoDB successfully.');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Disconnected from MongoDB. Reconnecting...');
    });

    await mongoose.connect(config.mongodbUri);
  } catch (error: any) {
    logger.error(`Failed to connect to MongoDB initially: ${error.message}`);
    process.exit(1);
  }
}

// Re-export models for easier imports
export * from './schemas/GuildSettings';
export * from './schemas/TrustedUser';
export * from './schemas/Backup';
export * from './schemas/Template';
export * from './schemas/AuditLog';
