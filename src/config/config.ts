import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

export interface Config {
  discordToken: string;
  discordClientId: string;
  discordClientSecret: string;
  mongodbUri: string;
  port: number;
  dashboardUrl: string;
  sessionSecret: string;
  backupEncryptionKey: string;
}

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is required but was not provided.`);
  }
  return value;
};

export const config: Config = {
  discordToken: getEnv('DISCORD_TOKEN', 'placeholder_token'),
  discordClientId: getEnv('DISCORD_CLIENT_ID', 'placeholder_client_id'),
  discordClientSecret: getEnv('DISCORD_CLIENT_SECRET', 'placeholder_client_secret'),
  mongodbUri: getEnv('MONGODB_URI', 'mongodb://localhost:27017/discord-sec-bot'),
  port: parseInt(getEnv('PORT', '5000'), 10),
  dashboardUrl: getEnv('DASHBOARD_URL', 'http://localhost:5000'),
  sessionSecret: getEnv('SESSION_SECRET', 'super_secret_session_key_change_me'),
  backupEncryptionKey: getEnv('BACKUP_ENCRYPTION_KEY', 'default_32_chars_encryption_key_!!'),
};
