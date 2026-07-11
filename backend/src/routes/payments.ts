import { Router } from 'express';
import { paymentCreate, paymentQuery } from '@gym/shared';
import { Payment } from '../models';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { createPayment } from '../services/payments';
import { serializePayment } from '../serializers';

export const paymentsRouter = Router();

paymentsRouter.post('/', validateBody(paymentCreate), async (_req, res) => {
  const payment = await createPayment(res.locals.body, res.locals.user._id);
  ok(res, serializePayment(payment, res.locals.user.role), 201);
});

paymentsRouter.get('/', validateQuery(paymentQuery), async (_req, res) => {
  const q = res.locals.query;
  const user = res.locals.user;
  const filter: Record<string, unknown> = {};
  if (user.role !== 'admin') filter.createdBy = user._id; // staff: own entries only
  if (q.customerId) filter.customerId = q.customerId;
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(Payment, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializePayment(d as never, user.role)) });
});
