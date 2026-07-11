import { Router } from 'express';
import { expenseCreate, expenseQuery, expenseUpdate } from '@gym/shared';
import { Expense } from '../models';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { serializeExpense } from '../serializers';

export const expensesRouter = Router();

expensesRouter.post('/', validateBody(expenseCreate), async (_req, res) => {
  const expense = await Expense.create({ ...res.locals.body, createdBy: res.locals.user._id });
  ok(res, serializeExpense(expense, res.locals.user.role), 201);
});

expensesRouter.get('/', validateQuery(expenseQuery), async (_req, res) => {
  const q = res.locals.query;
  const user = res.locals.user;
  const filter: Record<string, unknown> = {};
  if (q.category) filter.category = q.category;
  if (q.from || q.to) filter.date = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  const page = await paginate(Expense, filter, q);
  listOk(res, { ...page, data: page.data.map((d) => serializeExpense(d as never, user.role)) });
});

expensesRouter.get('/:id', async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new ApiError(404, 'NOT_FOUND', 'Expense not found');
  ok(res, serializeExpense(expense, res.locals.user.role));
});

expensesRouter.patch('/:id', validateBody(expenseUpdate), async (req, res) => {
  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id },
    { $set: { ...res.locals.body, updatedBy: res.locals.user._id } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!expense) throw new ApiError(404, 'NOT_FOUND', 'Expense not found');
  ok(res, serializeExpense(expense, res.locals.user.role));
});

expensesRouter.delete('/:id', async (req, res) => {
  const expense = await Expense.findOneAndDelete({ _id: req.params.id });
  if (!expense) throw new ApiError(404, 'NOT_FOUND', 'Expense not found');
  ok(res, { deleted: true });
});
