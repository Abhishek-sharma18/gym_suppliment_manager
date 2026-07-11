import { Schema, model, Types } from 'mongoose';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@gym/shared';
import { auditFields } from './common';

export interface IExpense {
  category: ExpenseCategory;
  amount: number;
  date: Date;
  notes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}

const schema = new Schema<IExpense>({
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  notes: String,
  ...auditFields,
}, { timestamps: true, collection: 'expenses' });

export const Expense = model<IExpense>('Expense', schema);
