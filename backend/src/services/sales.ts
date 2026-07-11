import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import type { saleCreate, saleReturnCreate } from '@gym/shared';
import { Customer, Product, Sale, type ISale } from '../models';
import { ApiError } from '../lib/errors';
import { round2 } from '../lib/round';
import { postMovement } from './ledger';
import { nextSeq, yyyymmdd } from './counters';

type SaleInput = z.infer<typeof saleCreate>;
type ReturnInput = z.infer<typeof saleReturnCreate>;

export async function createSale(input: SaleInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const items: ISale['items'] = [];
    let subtotal = 0;

    for (const line of input.items) {
      const product = await Product.findOne({ _id: line.productId, isDeleted: false }).session(session);
      if (!product) throw new ApiError(404, 'NOT_FOUND', `Product not found: ${line.productId}`);

      const lineTotal = round2(line.qty * line.unitPrice);
      subtotal = round2(subtotal + lineTotal);

      await postMovement({
        type: 'SALE_OUT', itemKind: 'FINISHED', itemId: product._id, qty: -line.qty,
        unitCost: product.avgUnitCost, refType: 'SALE', userId,
      }, session);

      items.push({
        productId: product._id, qty: line.qty, unitPrice: line.unitPrice,
        unitCostAtSale: product.avgUnitCost, lineTotal,
      });
    }

    const total = round2(subtotal - input.discount);
    if (total < 0) throw new ApiError(400, 'BAD_DISCOUNT', 'Discount exceeds subtotal');
    const udhaarAmount = Math.max(0, round2(total - input.amountPaid));

    if (udhaarAmount > 0) {
      if (!input.customerId) throw new ApiError(400, 'CUSTOMER_REQUIRED', 'Udhaar sale needs a customer');
      const customer = await Customer.findOne({ _id: input.customerId, isDeleted: false }).session(session);
      if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
      await Customer.updateOne({ _id: customer._id },
        { $set: { udhaarBalance: round2(customer.udhaarBalance + udhaarAmount) } }, { session });
    }

    const seq = await nextSeq(`sale-${yyyymmdd(input.date)}`, session);
    const [sale] = await Sale.create([{
      invoiceNo: `S-${yyyymmdd(input.date)}-${seq}`,
      customerId: input.customerId, date: input.date, paymentMode: input.paymentMode,
      items, subtotal, discount: input.discount, total,
      amountPaid: input.amountPaid, udhaarAmount, returns: [], createdBy: userId,
    }], { session });
    return sale;
  });
}

export async function createSaleReturn(saleId: string, input: ReturnInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const sale = await Sale.findById(saleId).session(session);
    if (!sale) throw new ApiError(404, 'NOT_FOUND', 'Sale not found');

    let returnValue = 0;
    for (const line of input.items) {
      const soldLine = sale.items.find((i) => String(i.productId) === line.productId);
      if (!soldLine) throw new ApiError(400, 'NOT_IN_SALE', `Product ${line.productId} is not on this sale`);
      const alreadyReturned = sale.returns
        .flatMap((r) => r.items)
        .filter((i) => String(i.productId) === line.productId)
        .reduce((sum, i) => sum + i.qty, 0);
      if (line.qty > soldLine.qty - alreadyReturned) {
        throw new ApiError(400, 'OVER_RETURN',
          `Cannot return ${line.qty} of this product - only ${soldLine.qty - alreadyReturned} left un-returned`);
      }
      await postMovement({
        type: 'SALE_RETURN_IN', itemKind: 'FINISHED', itemId: soldLine.productId, qty: line.qty,
        unitCost: soldLine.unitCostAtSale, refType: 'SALE', refId: sale._id, userId,
      }, session);
      returnValue = round2(returnValue + line.qty * soldLine.unitPrice);
    }

    let udhaarReduced = 0;
    if (sale.customerId) {
      const customer = await Customer.findById(sale.customerId).session(session);
      if (customer) {
        udhaarReduced = round2(Math.min(returnValue, customer.udhaarBalance));
        if (udhaarReduced > 0) {
          await Customer.updateOne({ _id: customer._id },
            { $set: { udhaarBalance: round2(customer.udhaarBalance - udhaarReduced) } }, { session });
        }
      }
    }

    sale.returns.push({
      date: new Date(),
      items: input.items.map((i) => ({ productId: new mongoose.Types.ObjectId(i.productId), qty: i.qty })),
      refundNote: input.refundNote,
      udhaarReduced,
      createdBy: userId as Types.ObjectId,
    });
    await sale.save({ session });
    return sale;
  });
}
