import { z } from 'zod';
import { ITEM_KINDS, MOVEMENT_TYPES, REF_TYPES } from './enums';
import { isoDate, listQuery, money, objectId } from './common';

export const adjustmentCreate = z.object({
  itemKind: z.enum(ITEM_KINDS),
  itemId: objectId,
  qty: z.number().refine((q) => q !== 0, { message: 'qty cannot be zero' }), // signed
  note: z.string().trim().min(3).max(200), // mandatory — the "why"
});

export const movementOut = z.object({
  _id: objectId,
  type: z.enum(MOVEMENT_TYPES),
  itemKind: z.enum(ITEM_KINDS),
  itemId: objectId,
  qty: z.number(), // signed: + in, − out
  unitCost: money.optional(), // admin only
  refType: z.enum(REF_TYPES),
  refId: objectId.optional(),
  note: z.string().optional(),
  createdBy: objectId.optional(),
  createdAt: isoDate,
});
export type MovementOut = z.infer<typeof movementOut>;

export const movementQuery = listQuery.extend({
  itemKind: z.enum(ITEM_KINDS).optional(),
  itemId: objectId.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
