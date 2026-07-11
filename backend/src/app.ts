import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './lib/errors';
import { authRouter } from './routes/auth';
import { requireAuth, requireRole } from './middleware/auth';
import { usersRouter } from './routes/users';

export function createApp(): express.Express {
  const app = express();

  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'Gym API is running' });
  });

  // ROUTER MOUNTS (later tasks insert routers here, above the 404 handler)
  app.use('/api/auth', authRouter);
  app.use('/api/users', requireAuth, requireRole('admin'), usersRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}
