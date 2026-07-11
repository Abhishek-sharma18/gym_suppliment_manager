import { Schema, model, Types } from 'mongoose';
import { auditFields } from './common';

export interface IProduct {
  name: string;
  variant?: string;
  sku?: string;
  sellingPrice: number;
  packagingCostPerUnit: number;
  bom: { materialId: Types.ObjectId; qtyPerUnit: number }[];
  reorderLevel: number;
  currentQty: number;
  avgUnitCost: number;
  isDeleted: boolean;
}

const schema = new Schema<IProduct>({
  name: { type: String, required: true, trim: true },
  variant: String,
  sku: String,
  sellingPrice: { type: Number, required: true, min: 0 },
  packagingCostPerUnit: { type: Number, default: 0 },
  bom: [{
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    qtyPerUnit: { type: Number, required: true, min: 0 },
  }],
  reorderLevel: { type: Number, default: 0 },
  currentQty: { type: Number, default: 0 },  // cache - postMovement()/recount only
  avgUnitCost: { type: Number, default: 0 }, // 4dp - production service/recount only
  isDeleted: { type: Boolean, default: false },
  ...auditFields,
}, { timestamps: true, collection: 'products' });

export const Product = model<IProduct>('Product', schema);
