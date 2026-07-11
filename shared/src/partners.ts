import { z } from 'zod';
import { audit, money, objectId } from './common';

export const supplierCreate = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
});
export const supplierUpdate = supplierCreate.partial();
export const supplierOut = supplierCreate.extend({
  _id: objectId,
  isDeleted: z.boolean(),
}).extend(audit.shape);
export type SupplierOut = z.infer<typeof supplierOut>;

export const customerCreate = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).optional(),
});
export const customerUpdate = customerCreate.partial();
export const customerOut = customerCreate.extend({
  _id: objectId,
  udhaarBalance: money, // cache; updated only inside sale/payment/return transactions
  isDeleted: z.boolean(),
}).extend(audit.shape);
export type CustomerOut = z.infer<typeof customerOut>;
