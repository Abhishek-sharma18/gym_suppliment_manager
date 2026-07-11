import { Schema, model, Types } from 'mongoose';
import { PAYMENT_MODES, type PaymentMode } from '@gym/shared';
import { auditFields } from './common';

export interface IPayment {
  customerId: Types.ObjectId;
  amount: number;
  date: Date;
  paymentMode: PaymentMode;
  notes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}

const schema = new Schema<IPayment>({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  paymentMode: { type: String, enum: PAYMENT_MODES, required: true },
  notes: String,
  ...auditFields,
}, { timestamps: true, collection: 'payments' });

export const Payment = model<IPayment>('Payment', schema);
