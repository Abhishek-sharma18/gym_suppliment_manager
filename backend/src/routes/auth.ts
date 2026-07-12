import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { loginRequest, type LoginRequest } from '@gym/shared';
import { User } from '../models';
import { ApiError } from '../lib/errors';
import { ok } from '../lib/respond';
import { validateBody } from '../middleware/validate';
import { jwtSecret, requireAuth } from '../middleware/auth';
import { serializeUser } from '../serializers';

const COOKIE = 'token';
export const authRouter = Router();

// Fixed bcrypt hash of a random string, computed once at module load. When the
// account lookup fails we still run bcrypt.compare against this so a lookup
// miss and a wrong password take comparable time (no user-enumeration via a
// timing side-channel).
const DUMMY_HASH = bcrypt.hashSync('a2f9c7b1-6e3d-4c58-9a71-9d0b7f4e2c11', 10);

// Real limit is 10 attempts / 15 min per IP (LOGIN_RATE_LIMIT overrides the
// count). Under NODE_ENV=test the limiter is skipped by default so the many
// loginAgent() calls across the rest of the suite are never throttled; a
// dedicated test (rate-limit.test.ts) sets LOGIN_RATE_LIMIT to force it on
// and exercise the 429 path. Both skip() and max() re-read the env var per
// request, so this stays correct regardless of module load order.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => Number(process.env.LOGIN_RATE_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts count toward the limit: brute-force protection is
  // preserved while repeated successful dev logins never get throttled.
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === 'test' && !process.env.LOGIN_RATE_LIMIT,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many login attempts - try again in a few minutes' },
    });
  },
});

authRouter.post('/login', loginLimiter, validateBody(loginRequest), async (_req, res) => {
  const { email, password } = res.locals.body as LoginRequest;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new ApiError(401, 'BAD_CREDENTIALS', 'Wrong email or password');
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
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
