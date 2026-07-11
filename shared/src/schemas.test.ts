import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, MOVEMENT_TYPES, ROLES } from './enums';
import { listQuery, objectId } from './common';

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
