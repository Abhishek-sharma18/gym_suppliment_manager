import { Schema, model, Types } from 'mongoose';
import {
  ITEM_KINDS, MOVEMENT_TYPES, REF_TYPES,
  type ItemKind, type MovementType, type RefType,
} from '@gym/shared';
import { ApiError } from '../lib/errors';

export interface IStockMovement {
  type: MovementType;
  itemKind: ItemKind;
  itemId: Types.ObjectId;
  qty: number;
  unitCost?: number;
  refType: RefType;
  refId?: Types.ObjectId;
  note?: string;
  createdBy?: Types.ObjectId;
}

const schema = new Schema<IStockMovement>({
  type: { type: String, enum: MOVEMENT_TYPES, required: true },
  itemKind: { type: String, enum: ITEM_KINDS, required: true },
  itemId: { type: Schema.Types.ObjectId, required: true, index: true },
  qty: { type: Number, required: true },
  unitCost: Number,
  refType: { type: String, enum: REF_TYPES, required: true },
  refId: Schema.Types.ObjectId,
  note: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'stock_movements' });

const IMMUTABLE = (): never => {
  throw new ApiError(400, 'IMMUTABLE', 'stock_movements are immutable - corrections are new ADJUSTMENT movements');
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  schema.pre(op as 'updateOne', IMMUTABLE);
}
schema.pre('save', function () {
  if (!this.isNew) IMMUTABLE();
});

export const StockMovement = model<IStockMovement>('StockMovement', schema);
