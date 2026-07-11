import { z } from 'zod';
import { audit, money, objectId } from './common';

export const materialCreate = z.object({
  name: z.string().trim().min(1).max(80),
  buyUnit: z.string().trim().min(1).max(20),
  useUnit: z.string().trim().min(1).max(20),
  conversionFactor: z.number().positive(), // 1 buyUnit = N useUnit
  reorderLevel: z.number().min(0).default(0), // in useUnit
});
export const materialUpdate = materialCreate.partial();
export const materialOut = materialCreate.extend({
  _id: objectId,
  currentQty: z.number(), // useUnit; cache maintained only by postMovement()
  avgCost: money.optional(), // ₹ per useUnit — admin only, stripped for staff
  isDeleted: z.boolean(),
}).extend(audit.shape);
export type MaterialOut = z.infer<typeof materialOut>;
