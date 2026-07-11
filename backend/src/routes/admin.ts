import { Router } from 'express';
import { ok } from '../lib/respond';
import { runRecount } from '../services/recount';

export const adminRouter = Router();

adminRouter.post('/recount', async (_req, res) => {
  const result = await runRecount();
  ok(res, result);
});
