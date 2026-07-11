import { Schema, model, Types } from 'mongoose';
import { PAYMENT_MODES, type PaymentMode } from '@gym/shared';
import { auditFields } from './common';

export interface ISale {
  invoiceNo: string;
  customerId?: Types.ObjectId;
  date: Date;
  paymentMode: PaymentMode;
  items: { productId: Types.ObjectId; qty: number; unitPrice: number; unitCostAtSale: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  udhaarAmount: number;
  returns: {
    date: Date;
    items: { productId: Types.ObjectId; qty: number }[];
    refundNote?: string;
    udhaarReduced?: number;
    createdBy?: Types.ObjectId;
  }[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
}

const schema = new Schema<ISale>({
  invoiceNo: { type: String, required: true, unique: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  date: { type: Date, required: true },
  paymentMode: { type: String, enum: PAYMENT_MODES, required: true },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    unitCostAtSale: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  amountPaid: { type: Number, required: true },
  udhaarAmount: { type: Number, required: true },
  returns: [{
    date: { type: Date, required: true },
    items: [{
      productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
      qty: { type: Number, required: true },
    }],
    refundNote: String,
    udhaarReduced: Number,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  }],
  ...auditFields,
}, { timestamps: true, collection: 'sales' });

export const Sale = model<ISale>('Sale', schema);
