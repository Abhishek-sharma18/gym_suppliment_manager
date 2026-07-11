import { z } from 'zod';
import { audit, isoDate, money, objectId } from './common';

export const consumeLineIn = z.object({
  materialId: objectId,
  actualQty: z.number().min(0),   // useUnit actually consumed into product
  wastageQty: z.number().min(0).default(0),
}).refine((l) => l.actualQty + l.wastageQty > 0, { message: 'line must consume or waste something' });

export const productionCreate = z.object({
  productId: objectId,
  qtyProduced: z.number().int().positive(),
  date: isoDate,
  expiryDate: isoDate.optional(),
  materialsConsumed: z.array(consumeLineIn).min(1),
});

export const costSnapshot = z.object({
  materialCost: money,
  packagingCost: money,
  totalCost: money,
  unitCost: money,
});

export const productionOut = z.object({
  _id: objectId,
  batchNo: z.string(), // server-generated B-YYYYMMDD-<seq>
  productId: objectId,
  qtyProduced: z.number().int().positive(),
  date: isoDate,
  expiryDate: isoDate.optional(),
  materialsConsumed: z.array(z.object({
    materialId: objectId,
    plannedQty: z.number().min(0), // server-computed from BoM × qtyProduced
    actualQty: z.number().min(0),
    wastageQty: z.number().min(0),
    costPerUseUnit: money.optional(), // admin only
  })),
  costSnapshot: costSnapshot.optional(), // admin only — immutable once written
}).extend(audit.shape);
export type ProductionOut = z.infer<typeof productionOut>;
