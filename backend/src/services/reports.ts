import type { Role } from '@gym/shared';
import { Customer, Expense, Material, Product, ProductionBatch, Sale } from '../models';
import { round2 } from '../lib/round';

interface LowStockItemOut {
  itemKind: 'RAW' | 'FINISHED';
  itemId: string;
  name: string;
  unit: string;
  currentQty: number;
  reorderLevel: number;
}

interface ExpiringBatchOut {
  batchNo: string;
  productId: string;
  productName: string;
  expiryDate: Date;
  qtyProduced: number;
}

interface UdhaarEntryOut {
  customerId: string;
  name: string;
  phone?: string;
  balance: number;
}

interface StockValueOut {
  rawValue: number;
  finishedValue: number;
  totalValue: number;
}

interface ProfitReportOut {
  month: string;
  revenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  overhead: number;
  unitsProduced: number;
  unitsSold: number;
  overheadPerUnit: number;
  netProfit: number;
}

interface SalesSummaryOut {
  from: Date;
  to: Date;
  count: number;
  revenue?: number;
  byPaymentMode: { mode: string; count: number; total?: number }[];
}

interface DashboardOut {
  todaySalesCount: number;
  todaySalesTotal?: number;
  stockValue?: number;
  udhaarOutstanding?: number;
  lowStock: LowStockItemOut[];
  expiringSoon: ExpiringBatchOut[];
}

export async function stockValue(): Promise<StockValueOut> {
  const [rawAgg] = await Material.aggregate<{ total: number }>([
    { $match: { isDeleted: false } },
    { $group: { _id: null, total: { $sum: { $multiply: ['$currentQty', '$avgCost'] } } } },
  ]);
  const [finAgg] = await Product.aggregate<{ total: number }>([
    { $match: { isDeleted: false } },
    { $group: { _id: null, total: { $sum: { $multiply: ['$currentQty', '$avgUnitCost'] } } } },
  ]);
  const rawValue = round2(rawAgg?.total ?? 0);
  const finishedValue = round2(finAgg?.total ?? 0);
  return { rawValue, finishedValue, totalValue: round2(rawValue + finishedValue) };
}

export async function lowStock(): Promise<LowStockItemOut[]> {
  const lowStockFilter = {
    isDeleted: false,
    reorderLevel: { $gt: 0 },
    $expr: { $lte: ['$currentQty', '$reorderLevel'] },
  };
  const materials = await Material.find(lowStockFilter);
  const products = await Product.find(lowStockFilter);
  return [
    ...materials.map((m) => ({
      itemKind: 'RAW' as const,
      itemId: String(m._id),
      name: m.name,
      unit: m.useUnit,
      currentQty: m.currentQty,
      reorderLevel: m.reorderLevel,
    })),
    ...products.map((p) => ({
      itemKind: 'FINISHED' as const,
      itemId: String(p._id),
      name: p.name,
      unit: 'unit',
      currentQty: p.currentQty,
      reorderLevel: p.reorderLevel,
    })),
  ];
}

export async function expiring(days: number): Promise<ExpiringBatchOut[]> {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const batches = await ProductionBatch
    .find({ expiryDate: { $gte: now, $lte: end } })
    .sort({ expiryDate: 1 });
  const productIds = [...new Set(batches.map((b) => String(b.productId)))];
  const products = await Product.find({ _id: { $in: productIds } });
  const nameById = new Map(products.map((p) => [String(p._id), p.name]));
  return batches.map((b) => ({
    batchNo: b.batchNo,
    productId: String(b.productId),
    productName: nameById.get(String(b.productId)) ?? 'Unknown',
    expiryDate: b.expiryDate as Date,
    qtyProduced: b.qtyProduced,
  }));
}

export async function udhaarReport(): Promise<UdhaarEntryOut[]> {
  const customers = await Customer
    .find({ isDeleted: false, udhaarBalance: { $gt: 0 } })
    .sort({ udhaarBalance: -1 });
  return customers.map((c) => ({
    customerId: String(c._id),
    name: c.name,
    phone: c.phone,
    balance: round2(c.udhaarBalance),
  }));
}

export async function profit(month: string): Promise<ProfitReportOut> {
  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const dateFilter = { date: { $gte: from, $lt: to } };

  const [revAgg] = await Sale.aggregate<{ total: number }>([
    { $match: dateFilter },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);
  const [itemsAgg] = await Sale.aggregate<{ cost: number; units: number }>([
    { $match: dateFilter },
    { $unwind: '$items' },
    { $group: { _id: null, cost: { $sum: { $multiply: ['$items.qty', '$items.unitCostAtSale'] } }, units: { $sum: '$items.qty' } } },
  ]);
  const [expAgg] = await Expense.aggregate<{ total: number }>([
    { $match: dateFilter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const [prodAgg] = await ProductionBatch.aggregate<{ units: number }>([
    { $match: dateFilter },
    { $group: { _id: null, units: { $sum: '$qtyProduced' } } },
  ]);

  const revenue = round2(revAgg?.total ?? 0);
  const costOfGoodsSold = round2(itemsAgg?.cost ?? 0);
  const overhead = round2(expAgg?.total ?? 0);
  const unitsProduced = prodAgg?.units ?? 0;
  const unitsSold = itemsAgg?.units ?? 0;
  const overheadPerUnit = unitsProduced > 0 ? round2(overhead / unitsProduced) : 0;
  const grossProfit = round2(revenue - costOfGoodsSold);
  const netProfit = round2(grossProfit - overhead);

  return {
    month, revenue, costOfGoodsSold, grossProfit, overhead,
    unitsProduced, unitsSold, overheadPerUnit, netProfit,
  };
}

export async function salesSummary(from: Date, to: Date, role: Role): Promise<SalesSummaryOut> {
  const filter = { date: { $gte: from, $lte: to } };
  const count = await Sale.countDocuments(filter);
  const modeAgg = await Sale.aggregate<{ _id: string; count: number; total: number }>([
    { $match: filter },
    { $group: { _id: '$paymentMode', count: { $sum: 1 }, total: { $sum: '$total' } } },
  ]);
  const byPaymentMode = modeAgg.map((entry) => {
    const line: { mode: string; count: number; total?: number } = { mode: entry._id, count: entry.count };
    if (role === 'admin') line.total = round2(entry.total);
    return line;
  });

  const out: SalesSummaryOut = { from, to, count, byPaymentMode };
  if (role === 'admin') {
    const [revAgg] = await Sale.aggregate<{ total: number }>([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    out.revenue = round2(revAgg?.total ?? 0);
  }
  return out;
}

export async function dashboard(role: Role): Promise<DashboardOut> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const todayFilter = { date: { $gte: startOfToday, $lt: startOfTomorrow } };

  const todaySalesCount = await Sale.countDocuments(todayFilter);
  const low = await lowStock();
  const expiringSoon = await expiring(30);

  const out: DashboardOut = { todaySalesCount, lowStock: low, expiringSoon };

  if (role === 'admin') {
    const [salesTotalAgg] = await Sale.aggregate<{ total: number }>([
      { $match: todayFilter },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    out.todaySalesTotal = round2(salesTotalAgg?.total ?? 0);
    out.stockValue = (await stockValue()).totalValue;
    const [udhaarAgg] = await Customer.aggregate<{ total: number }>([
      { $match: { isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$udhaarBalance' } } },
    ]);
    out.udhaarOutstanding = round2(udhaarAgg?.total ?? 0);
  }

  return out;
}
