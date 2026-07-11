import { Schema, model, Types } from 'mongoose';
import { PAYMENT_MODES, type PaymentMode } from '@gym/shared';
import { auditFields } from './common';

export interface IPurchase {
  supplierId: Types.ObjectId;
  invoiceNo?: string;
  date: Date;
  paymentMode: PaymentMode;
  items: { materialId: Types.ObjectId; qtyBuyUnit: number; costPerBuyUnit: number; lineTotal: number }[];
  totalAmount: number;
}

const schema = new Schema<IPurchase>({
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
  invoiceNo: String,
  date: { type: Date, required: true },
  paymentMode: { type: String, enum: PAYMENT_MODES, required: true },
  items: [{
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    qtyBuyUnit: { type: Number, required: true },
    costPerBuyUnit: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  }],
  totalAmount: { type: Number, required: true },
  ...auditFields,
}, { timestamps: true, collection: 'purchases' });

export const Purchase = model<IPurchase>('Purchase', schema);
