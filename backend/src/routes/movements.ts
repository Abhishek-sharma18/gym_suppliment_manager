import { Router } from 'express';
import mongoose from 'mongoose';
import { adjustmentCreate, movementQuery } from '@gym/shared';
import { StockMovement } from '../models';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { requireRole } from '../middleware/auth';
import { postMovement } from '../services/ledger';
import { serializeMovement } from '../serializers';

export const movementsRouter = Router();

movementsRouter.get('/', validateQuery(movementQuery), async (_req, res) => {
  const q = res.locals.query;
  const filter: Record<string, unknown> = {};
  if (q.itemKind) filter.itemKind = q.itemKind;
  if (q.itemId) filter.itemId = q.itemId;
  if (q.type) filter.type = q.type;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(StockMovement, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializeMovement(d as never, res.locals.user.role)) });
});

movementsRouter.post('/adjustments', requireRole('admin'), validateBody(adjustmentCreate), async (_req, res) => {
  const body = res.locals.body;
  const result = await mongoose.connection.transaction(async (session) =>
    postMovement({
      type: 'ADJUSTMENT', itemKind: body.itemKind, itemId: body.itemId, qty: body.qty,
      refType: 'ADJUSTMENT', note: body.note, userId: res.locals.user._id,
    }, session),
  );
  ok(res, result, 201);
});
