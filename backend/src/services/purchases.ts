import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import type { purchaseCreate } from '@gym/shared';
import { Material, Purchase, Supplier, type IPurchase } from '../models';
import { ApiError } from '../lib/errors';
import { round2, round4 } from '../lib/round';
import { postMovement } from './ledger';

type PurchaseInput = z.infer<typeof purchaseCreate>;

export async function createPurchase(input: PurchaseInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const supplier = await Supplier.findOne({ _id: input.supplierId, isDeleted: false }).session(session);
    if (!supplier) throw new ApiError(404, 'NOT_FOUND', 'Supplier not found');

    const items: IPurchase['items'] = [];
    let totalAmount = 0;

    for (const line of input.items) {
      const material = await Material.findOne({ _id: line.materialId, isDeleted: false }).session(session);
      if (!material) throw new ApiError(404, 'NOT_FOUND', `Material not found: ${line.materialId}`);

      const qtyUse = round2(line.qtyBuyUnit * material.conversionFactor);
      const costPerUse = line.costPerBuyUnit / material.conversionFactor;
      const prevQty = material.currentQty;
      const prevAvg = material.avgCost;

      await postMovement({
        type: 'PURCHASE_IN', itemKind: 'RAW', itemId: material._id, qty: qtyUse,
        unitCost: round4(costPerUse), refType: 'PURCHASE', userId,
      }, session);

      const newQty = prevQty + qtyUse;
      const newAvg = newQty > 0 ? round4((prevQty * prevAvg + qtyUse * costPerUse) / newQty) : round4(costPerUse);
      await Material.updateOne({ _id: material._id }, { $set: { avgCost: newAvg } }, { session });

      const lineTotal = round2(line.qtyBuyUnit * line.costPerBuyUnit);
      totalAmount = round2(totalAmount + lineTotal);
      items.push({ materialId: material._id, qtyBuyUnit: line.qtyBuyUnit, costPerBuyUnit: line.costPerBuyUnit, lineTotal });
    }

    const [purchase] = await Purchase.create([{
      supplierId: input.supplierId, invoiceNo: input.invoiceNo, date: input.date,
      paymentMode: input.paymentMode, items, totalAmount, createdBy: userId,
    }], { session });
    return purchase;
  });
}
