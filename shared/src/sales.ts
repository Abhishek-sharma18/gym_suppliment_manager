import { z } from 'zod';
import { PAYMENT_MODES } from './enums';
import { audit, isoDate, listQuery, money, objectId } from './common';

export const saleLineIn = z.object({
  productId: objectId,
  qty: z.number().int().positive(),
  unitPrice: money, // prefilled from product.sellingPrice, editable
});

const EPS = 0.001;
const subtotalOf = (items: { qty: number; unitPrice: number }[]) =>
  items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

export const saleCreate = z.object({
  customerId: objectId.optional(),
  date: isoDate,
  paymentMode: z.enum(PAYMENT_MODES),
  discount: money.default(0),
  amountPaid: money,
  items: z.array(saleLineIn).min(1),
})
  .refine((s) => s.discount <= subtotalOf(s.items) + EPS,
    { message: 'discount cannot exceed subtotal', path: ['discount'] })
  .refine((s) => s.amountPaid <= subtotalOf(s.items) - s.discount + EPS,
    { message: 'amountPaid cannot exceed the sale total', path: ['amountPaid'] })
  .refine((s) => s.amountPaid >= subtotalOf(s.items) - s.discount - EPS || !!s.customerId,
    { message: 'customerId is required for an udhaar sale', path: ['customerId'] });

export const saleReturnCreate = z.object({
  items: z.array(z.object({ productId: objectId, qty: z.number().int().positive() })).min(1),
  refundNote: z.string().trim().max(200).optional(),
});

export const saleOut = z.object({
  _id: objectId,
  invoiceNo: z.string(), // server-generated S-YYYYMMDD-<seq>
  customerId: objectId.optional(),
  date: isoDate,
  paymentMode: z.enum(PAYMENT_MODES),
  items: z.array(saleLineIn.extend({
    lineTotal: money,
    unitCostAtSale: money.optional(), // admin only — snapshot of product.avgUnitCost
  })),
  subtotal: money,
  discount: money,
  total: money,
  amountPaid: money,
  udhaarAmount: money,
  returns: z.array(z.object({
    date: isoDate,
    items: z.array(z.object({ productId: objectId, qty: z.number().int().positive() })),
    refundNote: z.string().optional(),
    udhaarReduced: money.optional(),
    returnValue: money.optional(), // Rs value of the returned goods at the sale's (weighted-avg) price
    returnCogs: money.optional(),  // cost of the returned goods at the sale's weighted-avg unitCostAtSale
    createdBy: objectId.optional(),
  })).default([]),
}).extend(audit.shape);
export type SaleOut = z.infer<typeof saleOut>;

export const saleQuery = listQuery.extend({
  customerId: objectId.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
