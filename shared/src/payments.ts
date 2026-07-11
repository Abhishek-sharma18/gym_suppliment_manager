import { z } from 'zod';
import { PAYMENT_MODES } from './enums';
import { audit, isoDate, objectId } from './common';

export const paymentCreate = z.object({
  customerId: objectId,
  amount: z.number().positive(), // must also be ≤ customer's current udhaarBalance (server-checked)
  date: isoDate,
  mode: z.enum(PAYMENT_MODES),
  notes: z.string().trim().max(200).optional(),
});
export const paymentOut = paymentCreate.extend({ _id: objectId }).extend(audit.shape);
export type PaymentOut = z.infer<typeof paymentOut>;
