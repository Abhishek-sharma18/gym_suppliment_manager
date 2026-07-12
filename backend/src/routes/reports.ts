import { Router } from 'express';
import {
  expiringQuery, profitQuery, salesSummaryQuery, trendsQuery,
} from '@gym/shared';
import { ok } from '../lib/respond';
import { validateQuery } from '../middleware/validate';
import { requireRole } from '../middleware/auth';
import {
  dashboard, expiring, lowStock, profit, salesSummary, stockValue, trends, udhaarReport,
} from '../services/reports';

export const reportsRouter = Router();

reportsRouter.get('/dashboard', async (_req, res) => {
  ok(res, await dashboard(res.locals.user.role));
});

reportsRouter.get('/stock-value', requireRole('admin'), async (_req, res) => {
  ok(res, await stockValue());
});

reportsRouter.get('/profit', requireRole('admin'), validateQuery(profitQuery), async (_req, res) => {
  ok(res, await profit(res.locals.query.month));
});

reportsRouter.get('/low-stock', async (_req, res) => {
  ok(res, await lowStock());
});

reportsRouter.get('/expiring', validateQuery(expiringQuery), async (_req, res) => {
  ok(res, await expiring(res.locals.query.days));
});

reportsRouter.get('/udhaar', async (_req, res) => {
  ok(res, await udhaarReport());
});

reportsRouter.get('/sales-summary', validateQuery(salesSummaryQuery), async (_req, res) => {
  const q = res.locals.query;
  ok(res, await salesSummary(q.from, q.to, res.locals.user.role));
});

reportsRouter.get('/trends', requireRole('admin'), validateQuery(trendsQuery), async (_req, res) => {
  ok(res, await trends(res.locals.query.months));
});
