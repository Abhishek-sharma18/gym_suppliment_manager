import type { Model, Types } from 'mongoose';
import { Customer, Material, Payment, Product, Sale, StockMovement } from '../models';
import { round2 } from '../lib/round';

interface Drift {
  itemKind: 'RAW' | 'FINISHED';
  itemId: string;
  name: string;
  cachedQty: number;
  ledgerQty: number;
}

interface CachedItem {
  _id: Types.ObjectId;
  name: string;
  currentQty: number;
}

async function recomputeCache(
  kind: 'RAW' | 'FINISHED',
  model: Model<CachedItem>,
  ledger: Map<string, number>,
  details: Drift[],
): Promise<void> {
  for (const item of await model.find({})) {
    const ledgerQty = ledger.get(`${kind}:${String(item._id)}`) ?? 0;
    if (Math.abs(item.currentQty - ledgerQty) > 1e-9) {
      details.push({ itemKind: kind, itemId: String(item._id), name: item.name, cachedQty: item.currentQty, ledgerQty });
      await model.updateOne({ _id: item._id }, { $set: { currentQty: ledgerQty } });
    }
  }
}

export async function runRecount(): Promise<{ driftsFound: number; details: Drift[]; customersFixed: number }> {
  const sums = await StockMovement.aggregate<{ _id: { itemKind: string; itemId: unknown }; qty: number }>([
    { $group: { _id: { itemKind: '$itemKind', itemId: '$itemId' }, qty: { $sum: '$qty' } } },
  ]);
  const ledger = new Map(sums.map((s) => [`${s._id.itemKind}:${String(s._id.itemId)}`, round2(s.qty)]));

  const details: Drift[] = [];
  await recomputeCache('RAW', Material as unknown as Model<CachedItem>, ledger, details);
  await recomputeCache('FINISHED', Product as unknown as Model<CachedItem>, ledger, details);

  let customersFixed = 0;
  for (const customer of await Customer.find({})) {
    const [saleAgg] = await Sale.aggregate<{ udhaar: number; reduced: number }>([
      { $match: { customerId: customer._id } },
      { $project: { udhaarAmount: 1, reduced: { $sum: '$returns.udhaarReduced' } } },
      { $group: { _id: null, udhaar: { $sum: '$udhaarAmount' }, reduced: { $sum: '$reduced' } } },
    ]);
    const [payAgg] = await Payment.aggregate<{ paid: number }>([
      { $match: { customerId: customer._id } },
      { $group: { _id: null, paid: { $sum: '$amount' } } },
    ]);
    const expected = round2((saleAgg?.udhaar ?? 0) - (saleAgg?.reduced ?? 0) - (payAgg?.paid ?? 0));
    if (Math.abs(customer.udhaarBalance - expected) > 1e-9) {
      await Customer.updateOne({ _id: customer._id }, { $set: { udhaarBalance: expected } });
      customersFixed += 1;
    }
  }

  return { driftsFound: details.length, details, customersFixed };
}
