import { Router } from 'express';
import { productionCreate, productionQuery } from '@gym/shared';
import { ProductionBatch } from '../models';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { createProductionBatch } from '../services/production';
import { serializeProduction } from '../serializers';

export const productionRouter = Router();

productionRouter.post('/', validateBody(productionCreate), async (_req, res) => {
  const batch = await createProductionBatch(res.locals.body, res.locals.user._id);
  ok(res, serializeProduction(batch, res.locals.user.role), 201);
});

productionRouter.get('/', validateQuery(productionQuery), async (_req, res) => {
  const q = res.locals.query;
  const user = res.locals.user;
  const filter: Record<string, unknown> = {};
  if (user.role !== 'admin') filter.createdBy = user._id;
  if (q.productId) filter.productId = q.productId;
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(ProductionBatch, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializeProduction(d as never, user.role)) });
});

productionRouter.get('/:id', async (req, res) => {
  const user = res.locals.user;
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role !== 'admin') filter.createdBy = user._id;
  const batch = await ProductionBatch.findOne(filter);
  if (!batch) throw new ApiError(404, 'NOT_FOUND', 'Batch not found');
  ok(res, serializeProduction(batch, user.role));
});
