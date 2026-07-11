import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, MOVEMENT_TYPES, ROLES } from './enums';
import { listQuery, objectId } from './common';
import { materialCreate, materialUpdate } from './materials';
import { productCreate, productUpdate } from './products';
import { adjustmentCreate } from './movements';
import { saleCreate } from './sales';
import { consumeLineIn } from './production';
import { profitReportOut } from './reports';

describe('enums', () => {
  it('defines the exact role and movement sets from the spec', () => {
    expect(ROLES).toEqual(['admin', 'staff']);
    expect(MOVEMENT_TYPES).toEqual([
      'PURCHASE_IN', 'PRODUCTION_CONSUME', 'PRODUCTION_OUT',
      'SALE_OUT', 'SALE_RETURN_IN', 'WASTAGE', 'ADJUSTMENT',
    ]);
    expect(ITEM_KINDS).toEqual(['RAW', 'FINISHED']);
  });
});

describe('common', () => {
  it('objectId accepts a 24-hex string and rejects junk', () => {
    expect(objectId.safeParse('64b7f3a2c9e77a0012345678').success).toBe(true);
    expect(objectId.safeParse('not-an-id').success).toBe(false);
  });
  it('listQuery coerces strings and applies defaults', () => {
    expect(listQuery.parse({})).toEqual({ page: 1, limit: 20 });
    expect(listQuery.parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 });
  });
});

describe('master data', () => {
  it('material rejects non-positive conversionFactor', () => {
    const base = { name: 'Whey', buyUnit: 'kg', useUnit: 'g', conversionFactor: 0 };
    expect(materialCreate.safeParse(base).success).toBe(false);
    expect(materialCreate.safeParse({ ...base, conversionFactor: 1000 }).success).toBe(true);
  });
  it('product defaults bom to [] and packagingCost to 0', () => {
    const p = productCreate.parse({ name: 'Protein Jar 1kg', sellingPrice: 2500 });
    expect(p.bom).toEqual([]);
    expect(p.packagingCostPerUnit).toBe(0);
  });
});

describe('sales', () => {
  const items = [{ productId: '64b7f3a2c9e77a0012345678', qty: 2, unitPrice: 100 }];
  const base = { date: '2026-07-11', paymentMode: 'CASH', items };
  it('accepts a fully paid sale without a customer', () => {
    expect(saleCreate.safeParse({ ...base, amountPaid: 200 }).success).toBe(true);
  });
  it('rejects amountPaid above total', () => {
    expect(saleCreate.safeParse({ ...base, amountPaid: 250 }).success).toBe(false);
  });
  it('requires customerId when there is udhaar', () => {
    expect(saleCreate.safeParse({ ...base, amountPaid: 50 }).success).toBe(false);
    expect(saleCreate.safeParse({
      ...base, amountPaid: 50, customerId: '64b7f3a2c9e77a0012345678',
    }).success).toBe(true);
  });
});

describe('adjustments', () => {
  it('rejects qty 0 and requires a note', () => {
    const a = { itemKind: 'RAW', itemId: '64b7f3a2c9e77a0012345678', qty: 0, note: 'recount fix' };
    expect(adjustmentCreate.safeParse(a).success).toBe(false);
    expect(adjustmentCreate.safeParse({ ...a, qty: -5 }).success).toBe(true);
  });
});

describe('update schemas', () => {
  it('do not re-inject defaults on partial updates', () => {
    expect(productUpdate.parse({ name: 'X' })).toEqual({ name: 'X' });
    expect(materialUpdate.parse({})).toEqual({});
  });
});

describe('production lines', () => {
  it('rejects a line that neither consumes nor wastes', () => {
    const l = { materialId: '64b7f3a2c9e77a0012345678', actualQty: 0, wastageQty: 0 };
    expect(consumeLineIn.safeParse(l).success).toBe(false);
  });
});

describe('profit report', () => {
  it('allows a loss-making month', () => {
    expect(profitReportOut.safeParse({
      month: '2026-07', revenue: 100, costOfGoodsSold: 80, grossProfit: 20,
      overhead: 500, unitsProduced: 10, unitsSold: 5, overheadPerUnit: 50, netProfit: -480,
    }).success).toBe(true);
  });
});

describe('sales edge cases', () => {
  const id = '64b7f3a2c9e77a0012345678';
  it('accepts discount exactly equal to subtotal (free sale, fully paid)', () => {
    expect(saleCreate.safeParse({
      date: '2026-07-11', paymentMode: 'CASH', discount: 200, amountPaid: 0,
      items: [{ productId: id, qty: 2, unitPrice: 100 }],
    }).success).toBe(true);
  });
  it('handles float subtotals at the paid boundary', () => {
    expect(saleCreate.safeParse({
      date: '2026-07-11', paymentMode: 'CASH', amountPaid: 99.99,
      items: [{ productId: id, qty: 3, unitPrice: 33.33 }],
    }).success).toBe(true);
  });
});

describe('barrel', () => {
  it('exports the contract from the package root', async () => {
    const barrel = await import('./index');
    expect(barrel.saleCreate).toBeDefined();
    expect(barrel.recountOut).toBeDefined();
    expect(barrel.paymentQuery).toBeDefined();
  });
});
