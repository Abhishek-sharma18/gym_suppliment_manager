import { Router } from 'express';
import { saleCreate, saleQuery, saleReturnCreate } from '@gym/shared';
import { Sale } from '../models';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { requireRole } from '../middleware/auth';
import { createSale, createSaleReturn } from '../services/sales';
import { serializeSale } from '../serializers';

export const salesRouter = Router();

salesRouter.post('/', validateBody(saleCreate), async (_req, res) => {
  const sale = await createSale(res.locals.body, res.locals.user._id);
  ok(res, serializeSale(sale, res.locals.user.role), 201);
});

salesRouter.get('/', validateQuery(saleQuery), async (_req, res) => {
  const q = res.locals.query;
  const user = res.locals.user;
  const filter: Record<string, unknown> = {};
  if (user.role !== 'admin') filter.createdBy = user._id;
  if (q.customerId) filter.customerId = q.customerId;
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(Sale, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializeSale(d as never, user.role)) });
});

salesRouter.get('/:id', async (req, res) => {
  const user = res.locals.user;
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role !== 'admin') filter.createdBy = user._id;
  const sale = await Sale.findOne(filter);
  if (!sale) throw new ApiError(404, 'NOT_FOUND', 'Sale not found');
  ok(res, serializeSale(sale, user.role));
});

salesRouter.post('/:id/return', requireRole('admin'), validateBody(saleReturnCreate), async (req, res) => {
  const sale = await createSaleReturn(String(req.params.id), res.locals.body, res.locals.user._id);
  ok(res, serializeSale(sale, res.locals.user.role));
});
