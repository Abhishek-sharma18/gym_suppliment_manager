import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import type { productionCreate } from '@gym/shared';
import { Material, Product, ProductionBatch, type IProductionBatch } from '../models';
import { ApiError } from '../lib/errors';
import { round2, round4 } from '../lib/round';
import { postMovement } from './ledger';
import { nextSeq, yyyymmdd } from './counters';

type ProductionInput = z.infer<typeof productionCreate>;

export async function createProductionBatch(input: ProductionInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const product = await Product.findOne({ _id: input.productId, isDeleted: false }).session(session);
    if (!product) throw new ApiError(404, 'NOT_FOUND', 'Product not found');
    if (product.bom.length === 0) {
      throw new ApiError(400, 'NO_RECIPE', `"${product.name}" has no recipe (BoM) - add one on the product first`);
    }
    if (input.expiryDate && input.expiryDate < input.date) {
      throw new ApiError(400, 'BAD_EXPIRY', 'Expiry date cannot be before the production date');
    }

    const planned = new Map(product.bom.map((b) => [String(b.materialId), round2(b.qtyPerUnit * input.qtyProduced)]));

    const consumed: IProductionBatch['materialsConsumed'] = [];
    let materialCost = 0;
    for (const line of input.materialsConsumed) {
      const material = await Material.findOne({ _id: line.materialId, isDeleted: false }).session(session);
      if (!material) throw new ApiError(404, 'NOT_FOUND', `Material not found: ${line.materialId}`);
      const costPerUseUnit = material.avgCost;

      if (line.actualQty > 0) {
        await postMovement({
          type: 'PRODUCTION_CONSUME', itemKind: 'RAW', itemId: material._id, qty: -line.actualQty,
          unitCost: costPerUseUnit, refType: 'PRODUCTION', userId,
        }, session);
      }
      if (line.wastageQty > 0) {
        await postMovement({
          type: 'WASTAGE', itemKind: 'RAW', itemId: material._id, qty: -line.wastageQty,
          unitCost: costPerUseUnit, refType: 'PRODUCTION', note: 'production wastage', userId,
        }, session);
      }

      materialCost += (line.actualQty + line.wastageQty) * costPerUseUnit;
      consumed.push({
        materialId: material._id,
        plannedQty: planned.get(String(material._id)) ?? 0,
        actualQty: line.actualQty,
        wastageQty: line.wastageQty,
        costPerUseUnit,
      });
    }

    materialCost = round2(materialCost);
    const packagingCost = round2(product.packagingCostPerUnit * input.qtyProduced);
    const totalCost = round2(materialCost + packagingCost);
    const unitCost = round4(totalCost / input.qtyProduced);

    const prevQty = product.currentQty;
    const prevAvg = product.avgUnitCost;
    await postMovement({
      type: 'PRODUCTION_OUT', itemKind: 'FINISHED', itemId: product._id, qty: input.qtyProduced,
      unitCost, refType: 'PRODUCTION', userId,
    }, session);
    const newQty = prevQty + input.qtyProduced;
    const newAvg = newQty > 0 ? round4((prevQty * prevAvg + input.qtyProduced * unitCost) / newQty) : unitCost;
    await Product.updateOne({ _id: product._id }, { $set: { avgUnitCost: newAvg } }, { session });

    const seq = await nextSeq(`batch-${yyyymmdd(input.date)}`, session);
    const [batch] = await ProductionBatch.create([{
      batchNo: `B-${yyyymmdd(input.date)}-${seq}`,
      productId: product._id,
      qtyProduced: input.qtyProduced,
      date: input.date,
      expiryDate: input.expiryDate,
      materialsConsumed: consumed,
      costSnapshot: { materialCost, packagingCost, totalCost, unitCost },
      createdBy: userId,
    }], { session });
    return batch;
  });
}
