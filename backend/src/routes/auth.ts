import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loginRequest, type LoginRequest } from '@gym/shared';
import { User } from '../models';
import { ApiError } from '../lib/errors';
import { ok } from '../lib/respond';
import { validateBody } from '../middleware/validate';
import { jwtSecret, requireAuth } from '../middleware/auth';
import { serializeUser } from '../serializers';

const COOKIE = 'token';
export const authRouter = Router();

authRouter.post('/login', validateBody(loginRequest), async (_req, res) => {
  const { email, password } = res.locals.body as LoginRequest;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, 'BAD_CREDENTIALS', 'Wrong email or password');
  }
  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret(), { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  ok(res, serializeUser(user, user.role));
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  ok(res, { loggedOut: true });
});

authRouter.get('/me', requireAuth, (_req, res) => {
  ok(res, serializeUser(res.locals.user, res.locals.user.role));
});
