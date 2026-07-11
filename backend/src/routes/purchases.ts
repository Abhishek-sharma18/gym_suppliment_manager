import { Router } from 'express';
import { purchaseCreate, purchaseQuery } from '@gym/shared';
import { Purchase } from '../models';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { createPurchase } from '../services/purchases';
import { serializePurchase } from '../serializers';

export const purchasesRouter = Router();

purchasesRouter.post('/', validateBody(purchaseCreate), async (_req, res) => {
  const purchase = await createPurchase(res.locals.body, res.locals.user._id);
  ok(res, serializePurchase(purchase, res.locals.user.role), 201);
});

purchasesRouter.get('/', validateQuery(purchaseQuery), async (_req, res) => {
  const q = res.locals.query;
  const user = res.locals.user;
  const filter: Record<string, unknown> = {};
  if (user.role !== 'admin') filter.createdBy = user._id; // staff: own entries only
  if (q.supplierId) filter.supplierId = q.supplierId;
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(Purchase, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializePurchase(d as never, user.role)) });
});

purchasesRouter.get('/:id', async (req, res) => {
  const user = res.locals.user;
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role !== 'admin') filter.createdBy = user._id;
  const purchase = await Purchase.findOne(filter);
  if (!purchase) throw new ApiError(404, 'NOT_FOUND', 'Purchase not found');
  ok(res, serializePurchase(purchase, user.role));
});
