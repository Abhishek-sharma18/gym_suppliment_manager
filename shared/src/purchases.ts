import { z } from 'zod';
import { PAYMENT_MODES } from './enums';
import { audit, isoDate, listQuery, money, objectId } from './common';

export const purchaseLineIn = z.object({
  materialId: objectId,
  qtyBuyUnit: z.number().positive(),
  costPerBuyUnit: money,
});
export const purchaseCreate = z.object({
  supplierId: objectId,
  invoiceNo: z.string().trim().max(40).optional(),
  date: isoDate,
  paymentMode: z.enum(PAYMENT_MODES),
  items: z.array(purchaseLineIn).min(1),
});
export const purchaseOut = z.object({
  _id: objectId,
  supplierId: objectId,
  invoiceNo: z.string().optional(),
  date: isoDate,
  paymentMode: z.enum(PAYMENT_MODES),
  items: z.array(z.object({
    materialId: objectId,
    qtyBuyUnit: z.number().positive(),
    costPerBuyUnit: money.optional(), // admin only - stripped for staff
    lineTotal: money.optional(),      // admin only - stripped for staff
  })),
  totalAmount: money.optional(),      // admin only - stripped for staff
}).extend(audit.shape);
export type PurchaseOut = z.infer<typeof purchaseOut>;

export const purchaseQuery = listQuery.extend({
  supplierId: objectId.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
