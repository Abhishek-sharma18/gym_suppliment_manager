import { z } from 'zod';
import { ROLES } from './enums';
import { audit, objectId } from './common';

export const userCreate = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email(),
  password: z.string().min(8).max(72),
  role: z.enum(ROLES),
});
export const userUpdate = userCreate.partial().extend({ isActive: z.boolean().optional() });
export const userOut = z.object({
  _id: objectId,
  name: z.string(),
  email: z.email(),
  role: z.enum(ROLES),
  isActive: z.boolean(),
}).extend(audit.shape);
export type UserOut = z.infer<typeof userOut>;
