import { z } from 'zod';
import { EXPENSE_CATEGORIES } from './enums';
import { audit, isoDate, listQuery, objectId } from './common';

export const expenseCreate = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  date: isoDate,
  notes: z.string().trim().max(200).optional(),
});
export const expenseUpdate = expenseCreate.partial();
export const expenseOut = expenseCreate.extend({ _id: objectId }).extend(audit.shape);
export type ExpenseOut = z.infer<typeof expenseOut>;

export const expenseQuery = listQuery.extend({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
