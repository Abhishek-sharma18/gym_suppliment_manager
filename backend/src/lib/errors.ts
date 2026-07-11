import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message;
    res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid request', fields } });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid id format' } });
    return;
  }
  const mongoErr = err as { code?: number; keyPattern?: Record<string, unknown> };
  if (mongoErr?.code === 11000) {
    const field = Object.keys(mongoErr.keyPattern ?? {})[0] ?? 'field';
    res.status(409).json({ error: { code: 'DUPLICATE', message: `That ${field} is already in use` } });
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
