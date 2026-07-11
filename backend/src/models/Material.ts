import { Schema, model } from 'mongoose';
import { auditFields } from './common';

export interface IMaterial {
  name: string;
  buyUnit: string;
  useUnit: string;
  conversionFactor: number;
  reorderLevel: number;
  currentQty: number;
  avgCost: number;
  isDeleted: boolean;
}

const schema = new Schema<IMaterial>({
  name: { type: String, required: true, trim: true },
  buyUnit: { type: String, required: true },
  useUnit: { type: String, required: true },
  conversionFactor: { type: Number, required: true, min: 0 },
  reorderLevel: { type: Number, default: 0 },
  currentQty: { type: Number, default: 0 }, // cache - written ONLY by postMovement()/recount
  avgCost: { type: Number, default: 0 },    // Rs per useUnit, 4dp - written only by purchase service/recount
  isDeleted: { type: Boolean, default: false },
  ...auditFields,
}, { timestamps: true, collection: 'raw_materials' });

export const Material = model<IMaterial>('Material', schema);
