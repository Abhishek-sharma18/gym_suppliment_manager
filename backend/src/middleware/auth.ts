import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@gym/shared';
import { User } from '../models';
import { ApiError } from '../lib/errors';

export function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new ApiError(500, 'CONFIG', 'JWT_SECRET is not set');
  return s;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.token;
  if (typeof token !== 'string' || !token) throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  let payload: { sub?: string };
  try {
    payload = jwt.verify(token, jwtSecret()) as { sub?: string };
  } catch {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired or invalid - please login again');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new ApiError(401, 'UNAUTHENTICATED', 'Account not found or disabled');
  res.locals.user = user;
  next();
}

export const requireRole = (...roles: Role[]) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user;
    if (!user || !roles.includes(user.role)) {
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }
    next();
  };
