# 🛡️ Antigravity Discord Security & Server Recovery Bot

An enterprise-grade, production-ready Discord Security & Server Recovery system. This bot protects your Discord servers against rogue admins, raiding bots, unauthorized modifications, and nukes, while offering real-time backup, restore, and template management capabilities.

---

## 📖 Contents

1. [Features](#-features)
2. [Installation Guide](#-installation-guide)
3. [Configuration Guide](#%EF%B8%8F-configuration-guide)
4. [Permission Guide](#-permission-guide)
5. [Deployment Guide](#%EF%B8%8F-deployment-guide)
6. [Docker Setup](#%EF%B8%8F-docker-setup)
7. [Environment Variables](#%EF%B8%8F-environment-variables)
8. [Dashboard Overview](#-dashboard-overview)

---

## ✨ Features

- **Anti-Nuke Rate Limiting**: Track and mitigate mass channel creation/deletion, mass role creation/deletion, and mass bans/kicks/timeouts.
- **Dangerous Grant Blockers**: Block unauthorized updates giving `Administrator` or other dangerous permissions to roles or members.
- **Unauthorized Bot Sentry**: Instantly kick unapproved bots and quarantine the admin who invited them.
- **Webhook Creator Shield**: Delete unauthorized webhooks and quarantine their creators.
- **Guild settings Guard**: Reverse unauthorized changes to vanity URLs, names, icons, or verification levels.
- **Spam Control**: Detect and eliminate message, invite link, and mention spam.
- **Quarantine Executor**: Strips all roles and places a 24-hour timeout on attackers immediately.
- **Server Backups**: Complete schema backup of server name, settings, roles, categories, channels, and overrides.
- **Layout Templates**: Save, list, apply, and transfer custom server structures.
- **Web Dashboard**: Interactive portal with Discord OAuth2 login for logs auditing, limits tuning, backup downloads/uploads, and layout mapping.

---

## 🛠️ Installation Guide

### Prerequisites
- [Node.js](https://nodejs.org/en) (v20 LTS recommended)
- [MongoDB](https://www.mongodb.com/) (Running instance)
- Discord Developer Account

### Steps
1. Clone or copy this repository to your target directory.
2. Initialize project configurations:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and fill in your details (refer to [Environment Variables](#%EF%B8%8F-environment-variables)).
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the typescript project:
   ```bash
   npm run build
   ```
5. Start the bot:
   ```bash
   npm start
   ```

---

## ⚙️ Configuration Guide

### Discord Developer Portal Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new Application.
3. Under **Bot**, enable the following **Privileged Gateway Intents**:
   - **Presence Intent**
   - **Server Members Intent** (Required to manage roles, kicks, timeouts)
   - **Message Content Intent** (Required to parse chat message spam)
4. Under **OAuth2**, set up a redirect URI pointing to your dashboard's callback URL:
   - Development: `http://localhost:5000/api/auth/callback`
   - Production: `https://your-domain.com/api/auth/callback`
5. Copy your **Client ID**, **Client Secret**, and **Bot Token** and add them to your `.env` file.

### Invite Link
Create an invite link with the following permissions:
- `Administrator` (required to guarantee the bot bypasses Discord's hierarchical restrictions to modify permissions of rogue administrators).

---

## 🔑 Permission Guide

To guarantee anti-nuke capabilities, you **MUST** configure roles correctly in Discord:

1. **Role Hierarchy**:
   > [!IMPORTANT]
   > The **Antigravity Security Bot** integration role **must be dragged to the very top** of your role list in Server Settings -> Roles.
   > If an attacker holds a role higher than the bot, Discord will prevent the bot from removing their roles or timing them out.

2. **Owner Immunity**:
   - The Server Owner (`guild.ownerId`) is completely immune to anti-nuke triggers.
   - Owner actions will never initiate quarantine.

3. **Trusted Bypass**:
   - Add trusted admins using `/trust <user>` or via the Web Dashboard.
   - Trusted users bypass all rate limits but *can still be monitored* if their actions are flagrant.

---

## ⚡ Command Guide

### Server Owner Commands
These commands are restricted strictly to the guild owner:
- `/help` - Displays the bot help instructions and security guides.
- `/backup create` - Creates a manual backup of the current server state.
- `/backup list` - Lists the latest 10 backups.
- `/backup delete <id>` - Deletes a specific backup by UUID.
- `/restore <id>` - Destructively rebuilds the server layout using backup configuration.
- `/template save <name>` - Saves the current server layout as a named template.
- `/template list` - Lists templates saved for the server.
- `/template apply <name>` - Rebuilds the server matching the template.
- `/template delete <name>` - Deletes a template.
- `/trust <user>` - Adds a user to bypass anti-nuke rate limits.
- `/untrust <user>` - Removes a user from the trusted bypass list.
- `/listtrusted` - Lists trusted users.
- `/security limits` - Views and configures limits for deletions, creations, kicks, and bans.
- `/security logs <channel>` - Sets the channel where beautiful security logs and embeds are sent.

---

## 🖥️ Deployment Guide

### PM2 Deployment (Recommended for VPS)
1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```
2. Build and start:
   ```bash
   npm run build
   pm2 start dist/index.js --name "security-bot"
   ```
3. Save state to restart on server boot:
   ```bash
   pm2 startup
   pm2 save
   ```

---

## 🐳 Docker Setup

The easiest way to host both the MongoDB instance and the bot container is using Docker Compose.

1. Configure `.env` on your host.
2. Build and run:
   ```bash
   docker-compose up --build -d
   ```
3. Docker Compose will automatically start:
   - MongoDB container (`security_bot_db`) listening internally on `27017`
   - Node bot container (`security_bot_app`) listening on port `5000`

---

## 🗂️ Environment Variables

Here is the format of parameters inside your `.env` configuration file:

| Parameter | Description | Example |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | Discord bot login credential token | `MTIzNDU2...` |
| `DISCORD_CLIENT_ID` | Application client ID | `123456789...` |
| `DISCORD_CLIENT_SECRET`| Application client secret (OAuth2) | `abcdefg...` |
| `MONGODB_URI` | Connection string to MongoDB | `mongodb://localhost:27017/discord-sec-bot` |
| `PORT` | Local port Express dashboard server runs on | `5000` |
| `DASHBOARD_URL` | Base URL of dashboard (no trailing slash) | `http://localhost:5000` |
| `SESSION_SECRET` | Secret used to sign session cookies | `some_long_random_string` |
| `BACKUP_ENCRYPTION_KEY`| 32-character key for downloads/uploads | `default_32_chars_encryption_key_!!` |

---

## 💻 Dashboard Overview

The web dashboard is styled with a premium glassmorphic dark theme and features:
- **Discord OAuth2 Authenticator**: Only logs in owners of active guild settings.
- **Incident Logs Audit**: Sortable tabular overview of critical anti-nuke actions and mitigations.
- **Limit Adjuster**: Slider/numerical form fields to change thresholds.
- **Backup Downloads/Uploads**: Export configurations as a `.json` file, or drag and drop to restore settings on new guilds.
