import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { listQuery, userCreate, userUpdate, type ListQuery } from '@gym/shared';
import { User } from '../models';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate, searchFilter } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { serializeUser } from '../serializers';

export const usersRouter = Router();

usersRouter.get('/', validateQuery(listQuery), async (_req, res) => {
  const q = res.locals.query as ListQuery;
  const page = await paginate(User, searchFilter(q.search, ['name', 'email']), q);
  listOk(res, { ...page, data: page.data.map((u) => serializeUser(u as never, 'admin')) });
});

usersRouter.post('/', validateBody(userCreate), async (_req, res) => {
  const { password, ...rest } = res.locals.body;
  const user = await User.create({
    ...rest,
    passwordHash: await bcrypt.hash(password, 10),
    createdBy: res.locals.user._id,
  });
  ok(res, serializeUser(user, 'admin'), 201);
});

usersRouter.get('/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  ok(res, serializeUser(user, 'admin'));
});

usersRouter.patch('/:id', validateBody(userUpdate), async (req, res) => {
  const { password, ...rest } = res.locals.body;
  const update: Record<string, unknown> = { ...rest, updatedBy: res.locals.user._id };
  if (password) update.passwordHash = await bcrypt.hash(password, 10);
  const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  ok(res, serializeUser(user, 'admin'));
});

usersRouter.delete('/:id', async (req, res) => {
  if (req.params.id === String(res.locals.user._id)) {
    throw new ApiError(400, 'SELF_DEACTIVATE', 'You cannot deactivate your own account');
  }
  const user = await User.findByIdAndUpdate(req.params.id,
    { $set: { isActive: false, updatedBy: res.locals.user._id } }, { new: true });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  ok(res, { deactivated: true });
});
