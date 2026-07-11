import type { Response } from 'express';

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data });
}

export function listOk(res: Response, payload: { data: unknown[]; page: number; limit: number; total: number }): void {
  res.json(payload);
}
