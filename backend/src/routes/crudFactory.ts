import { Router } from 'express';
import type { Model } from 'mongoose';
import type { Role } from '@gym/shared';
import { listQuery, type ListQuery } from '@gym/shared';
import type { ZodType } from 'zod';
import { ApiError } from '../lib/errors';
import { ok, listOk } from '../lib/respond';
import { paginate, searchFilter } from '../lib/paginate';
import { validateBody, validateQuery } from '../middleware/validate';
import { requireRole } from '../middleware/auth';

export function masterDataRouter(opts: {
  model: Model<never>;
  createSchema: ZodType;
  updateSchema: ZodType;
  serialize: (doc: unknown, role: Role) => unknown;
  searchFields: string[];
}): Router {
  const r = Router();
  const model = opts.model as Model<{ isDeleted: boolean }>;

  r.get('/', validateQuery(listQuery), async (_req, res) => {
    const q = res.locals.query as ListQuery;
    const role = res.locals.user.role as Role;
    const filter = { isDeleted: false, ...searchFilter(q.search, opts.searchFields) };
    const page = await paginate(model, filter, q);
    listOk(res, { ...page, data: page.data.map((d) => opts.serialize(d, role)) });
  });

  r.get('/:id', async (req, res) => {
    const doc = await model.findOne({ _id: req.params.id, isDeleted: false });
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Not found');
    ok(res, opts.serialize(doc, res.locals.user.role));
  });

  r.post('/', requireRole('admin'), validateBody(opts.createSchema), async (_req, res) => {
    const doc = await model.create({ ...res.locals.body, createdBy: res.locals.user._id });
    ok(res, opts.serialize(doc, res.locals.user.role), 201);
  });

  r.patch('/:id', requireRole('admin'), validateBody(opts.updateSchema), async (req, res) => {
    const doc = await model.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: { ...res.locals.body, updatedBy: res.locals.user._id } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Not found');
    ok(res, opts.serialize(doc, res.locals.user.role));
  });

  r.delete('/:id', requireRole('admin'), async (req, res) => {
    const doc = await model.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: { isDeleted: true, updatedBy: res.locals.user._id } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Not found');
    ok(res, { deleted: true });
  });

  return r;
}
