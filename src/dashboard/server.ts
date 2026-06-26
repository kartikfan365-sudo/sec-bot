import express, { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import path from 'path';
import { Client } from 'discord.js';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import apiRouter from './routes/api';

declare global {
  namespace Express {
    interface Request {
      client: Client;
    }
  }
}


export function startDashboardServer(client: Client): void {
  const app = express();

  // Trust proxy for secure cookies behind reverse proxy (e.g. Railway)
  app.set('trust proxy', 1);


  // 1. Enable CORS for development
  app.use(cors({
    origin: config.dashboardUrl,
    credentials: true
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 2. Configure Session Store
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: config.mongodbUri,
      collectionName: 'sessions'
    }),
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  }));

  // 3. Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: any, done) => {
    done(null, user);
  });

  // 4. Configure Discord OAuth2 Strategy
  passport.use(new DiscordStrategy({
    clientID: config.discordClientId,
    clientSecret: config.discordClientSecret,
    callbackURL: `${config.dashboardUrl}/api/auth/callback`,
    scope: ['identify', 'guilds']
  }, (accessToken, refreshToken, profile, done) => {
    // We store the profile containing user ID, username, avatar, and guilds in the session
    return done(null, {
      id: profile.id,
      username: `${profile.username}`,
      avatar: profile.avatar,
      guilds: profile.guilds
    });
  }));

  // 5. Inject Discord Client into requests
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.client = client;
    next();
  });

  // 6. Register API routes
  app.use('/api', apiRouter);

  // 7. Serve Static Frontend Files
  const fs = require('fs');
  const publicPath = fs.existsSync(path.join(__dirname, 'public'))
    ? path.join(__dirname, 'public')
    : path.join(__dirname, '../../src/dashboard/public');
  
  app.use(express.static(publicPath));

  // Fallback to index.html for SPA routing
  app.get('*', (req: Request, res: Response) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(200).send('API is running. Dashboard assets are loading.');
    }
  });


  // Start listening
  app.listen(config.port, () => {
    logger.info(`Web dashboard server running on port ${config.port} (${config.dashboardUrl})`);
  });
}
