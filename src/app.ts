import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/user/user.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // ── Security & basics ──────────────────────────────────────────────────────
  if (env.trustProxy !== false) {
    app.set('trust proxy', env.trustProxy);
  }
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // ── Health check (before rate limiting so monitors are never throttled) ────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { success: false, error: { message: 'Too many requests, slow down.' } },
    })
  );

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/auth', authRoutes);
  app.use('/user', userRoutes);
  app.use('/users', usersRoutes);

  // ── Errors ─────────────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
