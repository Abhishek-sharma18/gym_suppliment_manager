import { describe, expect, it } from 'vitest';
import { setupSuite } from './helpers/db';
import { Material, StockMovement } from '../models';

setupSuite('models');

describe('stock_movements immutability', () => {
  it('allows insert but rejects update and delete', async () => {
    const m = await Material.create({ name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000 });
    const mv = await StockMovement.create({
      type: 'ADJUSTMENT', itemKind: 'RAW', itemId: m._id, qty: 5, refType: 'ADJUSTMENT', note: 'test',
    });
    await expect(StockMovement.updateOne({ _id: mv._id }, { qty: 99 })).rejects.toThrow(/immutable/i);
    await expect(StockMovement.deleteOne({ _id: mv._id })).rejects.toThrow(/immutable/i);
    mv.qty = 42;
    await expect(mv.save()).rejects.toThrow(/immutable/i);
    expect((await StockMovement.findById(mv._id))!.qty).toBe(5);
  });
});

describe('defaults', () => {
  it('material starts at zero stock and zero avgCost, not deleted', async () => {
    const m = await Material.create({ name: 'Sugar', buyUnit: 'kg', useUnit: 'g', conversionFactor: 1000 });
    expect(m.currentQty).toBe(0);
    expect(m.avgCost).toBe(0);
    expect(m.isDeleted).toBe(false);
  });
});
