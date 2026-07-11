import { z } from 'zod';
import { audit, money, objectId } from './common';

export const bomLine = z.object({
  materialId: objectId,
  qtyPerUnit: z.number().positive(), // in the material's useUnit
});
export const productCreate = z.object({
  name: z.string().trim().min(1).max(80),
  variant: z.string().trim().max(40).optional(),
  sku: z.string().trim().max(40).optional(),
  sellingPrice: money,
  packagingCostPerUnit: money.default(0),
  bom: z.array(bomLine).default([]),
  reorderLevel: z.number().min(0).default(0),
});
export const productUpdate = productCreate.partial().extend({
  packagingCostPerUnit: money.optional(),
  bom: z.array(bomLine).optional(),
  reorderLevel: z.number().min(0).optional(),
});
export const productOut = productCreate.extend({
  _id: objectId,
  currentQty: z.number(),
  avgUnitCost: money.optional(), // admin only — moving weighted average across batches
  isDeleted: z.boolean(),
}).extend(audit.shape);
export type ProductOut = z.infer<typeof productOut>;
