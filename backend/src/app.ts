import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { errorHandler } from './lib/errors';
import { authRouter } from './routes/auth';
import { requireAuth, requireRole } from './middleware/auth';
import { usersRouter } from './routes/users';
import { materialsRouter, productsRouter, suppliersRouter, customersRouter } from './routes/masterData';
import { movementsRouter } from './routes/movements';
import { purchasesRouter } from './routes/purchases';
import { productionRouter } from './routes/production';
import { salesRouter } from './routes/sales';
import { paymentsRouter } from './routes/payments';
import { expensesRouter } from './routes/expenses';
import { adminRouter } from './routes/admin';
import { reportsRouter } from './routes/reports';

export function createApp(): express.Express {
  const app = express();

  if (process.env.NODE_ENV === 'production') {
    // Two proxy hops sit in front of Express in production:
    //   browser -> Vercel rewrite proxy -> Render front door -> Express.
    // Both must be trusted so req.ip (the login rate limiter key) resolves to
    // the real client IP instead of Vercel's egress IP.
    app.set('trust proxy', 2);
  }

  // gzip/deflate response bodies. threshold: 512 (not the 1KB default) skips compressing
  // tiny payloads like the /api/health ping while still compressing list/report JSON, which
  // is where compression actually pays off on the Render free-tier's limited egress.
  app.use(compression({ threshold: 512 }));

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
  app.use('/api/materials', requireAuth, materialsRouter);
  app.use('/api/products', requireAuth, productsRouter);
  app.use('/api/suppliers', requireAuth, suppliersRouter);
  app.use('/api/customers', requireAuth, customersRouter);
  app.use('/api/movements', requireAuth, movementsRouter);
  app.use('/api/purchases', requireAuth, purchasesRouter);
  app.use('/api/production', requireAuth, productionRouter);
  app.use('/api/sales', requireAuth, salesRouter);
  app.use('/api/payments', requireAuth, paymentsRouter);
  app.use('/api/expenses', requireAuth, requireRole('admin'), expensesRouter);
  app.use('/api/admin', requireAuth, requireRole('admin'), adminRouter);
  app.use('/api/reports', requireAuth, reportsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}
