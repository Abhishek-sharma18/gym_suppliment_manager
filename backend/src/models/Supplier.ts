import { Schema, model } from 'mongoose';
import { auditFields } from './common';

export interface ISupplier {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  isDeleted: boolean;
}

const schema = new Schema<ISupplier>({
  name: { type: String, required: true, trim: true },
  phone: String,
  address: String,
  notes: String,
  isDeleted: { type: Boolean, default: false },
  ...auditFields,
}, { timestamps: true, collection: 'suppliers' });

export const Supplier = model<ISupplier>('Supplier', schema);
