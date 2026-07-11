import { z } from 'zod';
import { ITEM_KINDS, PAYMENT_MODES } from './enums';
import { isoDate, money, objectId } from './common';

export const lowStockItem = z.object({
  itemKind: z.enum(ITEM_KINDS),
  itemId: objectId,
  name: z.string(),
  unit: z.string(), // useUnit for RAW, 'unit' for FINISHED
  currentQty: z.number(),
  reorderLevel: z.number(),
});

export const expiringBatch = z.object({
  batchNo: z.string(),
  productId: objectId,
  productName: z.string(),
  expiryDate: isoDate,
  qtyProduced: z.number(),
});

// Admin sees every field; staff response has the money fields stripped (they are optional here).
export const dashboardOut = z.object({
  todaySalesCount: z.number().int(),
  todaySalesTotal: money.optional(),   // admin
  stockValue: money.optional(),        // admin
  udhaarOutstanding: money.optional(), // admin
  lowStock: z.array(lowStockItem),
  expiringSoon: z.array(expiringBatch),
});
export type DashboardOut = z.infer<typeof dashboardOut>;

export const stockValueOut = z.object({
  rawValue: money,      // Σ material.currentQty × avgCost
  finishedValue: money, // Σ product.currentQty × avgUnitCost
  totalValue: money,
});

export const profitReportOut = z.object({
  month: z.string(), // 'YYYY-MM'
  revenue: money,
  costOfGoodsSold: money, // Σ unitCostAtSale × qty over the month's sales
  grossProfit: z.number(),  // revenue − costOfGoodsSold; negative = loss
  overhead: money,        // month's expenses total
  unitsProduced: z.number(),
  unitsSold: z.number(),
  overheadPerUnit: money, // overhead ÷ unitsProduced (0 if none produced)
  netProfit: z.number(),    // grossProfit − overhead; negative = loss
});

export const udhaarEntry = z.object({
  customerId: objectId,
  name: z.string(),
  phone: z.string().optional(),
  balance: money,
});

export const salesSummaryOut = z.object({
  from: isoDate,
  to: isoDate,
  count: z.number().int(),
  revenue: money.optional(), // admin
  byPaymentMode: z.array(z.object({ mode: z.enum(PAYMENT_MODES), count: z.number().int(), total: money.optional() })),
});

// POST /api/admin/recount response — cache rebuild report
export const recountOut = z.object({
  driftsFound: z.number().int(),
  details: z.array(z.object({
    itemKind: z.enum(ITEM_KINDS),
    itemId: objectId,
    name: z.string(),
    cachedQty: z.number(),  // value before rebuild
    ledgerQty: z.number(),  // value recomputed from movements
  })),
});

export const profitQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'use YYYY-MM'),
});

export const expiringQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const salesSummaryQuery = z.object({
  from: isoDate,
  to: isoDate,
});
