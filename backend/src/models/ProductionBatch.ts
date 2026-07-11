import { Schema, model, Types } from 'mongoose';
import { auditFields } from './common';

export interface IProductionBatch {
  batchNo: string;
  productId: Types.ObjectId;
  qtyProduced: number;
  date: Date;
  expiryDate?: Date;
  materialsConsumed: {
    materialId: Types.ObjectId; plannedQty: number; actualQty: number; wastageQty: number; costPerUseUnit: number;
  }[];
  costSnapshot: { materialCost: number; packagingCost: number; totalCost: number; unitCost: number };
}

const schema = new Schema<IProductionBatch>({
  batchNo: { type: String, required: true, unique: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  qtyProduced: { type: Number, required: true },
  date: { type: Date, required: true },
  expiryDate: Date,
  materialsConsumed: [{
    materialId: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    plannedQty: { type: Number, required: true },
    actualQty: { type: Number, required: true },
    wastageQty: { type: Number, required: true },
    costPerUseUnit: { type: Number, required: true },
  }],
  costSnapshot: {
    materialCost: { type: Number, required: true },
    packagingCost: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    unitCost: { type: Number, required: true },
  },
  ...auditFields,
}, { timestamps: true, collection: 'production_batches' });

export const ProductionBatch = model<IProductionBatch>('ProductionBatch', schema);
