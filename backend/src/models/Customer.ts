import { Schema, model } from 'mongoose';
import { auditFields } from './common';

export interface ICustomer {
  name: string;
  phone?: string;
  udhaarBalance: number;
  isDeleted: boolean;
}

const schema = new Schema<ICustomer>({
  name: { type: String, required: true, trim: true },
  phone: String,
  udhaarBalance: { type: Number, default: 0 }, // cache - sale/payment/return services + recount only
  isDeleted: { type: Boolean, default: false },
  ...auditFields,
}, { timestamps: true, collection: 'customers' });

export const Customer = model<ICustomer>('Customer', schema);
