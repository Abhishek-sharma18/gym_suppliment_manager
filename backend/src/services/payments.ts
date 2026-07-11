import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import type { paymentCreate } from '@gym/shared';
import { Customer, Payment } from '../models';
import { ApiError } from '../lib/errors';
import { round2 } from '../lib/round';

type PaymentInput = z.infer<typeof paymentCreate>;

export async function createPayment(input: PaymentInput, userId: Types.ObjectId | string) {
  return mongoose.connection.transaction(async (session) => {
    const customer = await Customer.findOne({ _id: input.customerId, isDeleted: false }).session(session);
    if (!customer) throw new ApiError(404, 'NOT_FOUND', 'Customer not found');
    if (input.amount > customer.udhaarBalance + 0.001) {
      throw new ApiError(400, 'OVERPAY',
        `Payment ${input.amount} exceeds outstanding udhaar ${customer.udhaarBalance}`);
    }
    await Customer.updateOne({ _id: customer._id },
      { $set: { udhaarBalance: round2(customer.udhaarBalance - input.amount) } }, { session });
    const [payment] = await Payment.create([{ ...input, createdBy: userId }], { session });
    return payment;
  });
}
