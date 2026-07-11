import type { ClientSession, Types } from 'mongoose';
import type { ItemKind, MovementType, RefType } from '@gym/shared';
import { Material, Product, StockMovement } from '../models';
import { ApiError } from '../lib/errors';
import { round2 } from '../lib/round';

const QTY_EPS = 1e-9;

export interface PostMovementInput {
  type: MovementType;
  itemKind: ItemKind;
  itemId: Types.ObjectId | string;
  qty: number; // signed: positive = stock in, negative = stock out
  unitCost?: number;
  refType: RefType;
  refId?: Types.ObjectId | string;
  note?: string;
  userId: Types.ObjectId | string;
}

// CLAUDE.md rule 1: the ONLY code path that writes stock_movements and touches cached currentQty.
// Callers MUST wrap calls in mongoose.connection.transaction (or withTransaction) so
// write-conflict retries re-run the closure and re-read fresh stock state.
export async function postMovement(input: PostMovementInput, session: ClientSession): Promise<{ newQty: number }> {
  if (!Number.isFinite(input.qty) || input.qty === 0) {
    throw new ApiError(400, 'BAD_MOVEMENT', 'Movement qty must be a non-zero number');
  }
  const model = input.itemKind === 'RAW' ? Material : Product;
  const item = await (model as typeof Material).findOne({ _id: input.itemId }).session(session);
  if (!item || item.isDeleted) {
    throw new ApiError(404, 'NOT_FOUND', `${input.itemKind === 'RAW' ? 'Material' : 'Product'} not found`);
  }

  const newQty = round2(item.currentQty + input.qty);
  if (newQty < -QTY_EPS) {
    throw new ApiError(409, 'INSUFFICIENT_STOCK',
      `Not enough stock of "${item.name}": available ${item.currentQty}, requested ${Math.abs(input.qty)}`);
  }

  await StockMovement.create([{
    type: input.type,
    itemKind: input.itemKind,
    itemId: input.itemId,
    qty: input.qty,
    unitCost: input.unitCost,
    refType: input.refType,
    refId: input.refId,
    note: input.note,
    createdBy: input.userId,
  }], { session });

  item.currentQty = newQty;
  await item.save({ session });
  return { newQty };
}
