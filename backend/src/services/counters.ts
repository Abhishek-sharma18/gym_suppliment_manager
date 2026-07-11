import type { ClientSession } from 'mongoose';
import { Counter } from '../models';

export async function nextSeq(key: string, session: ClientSession): Promise<number> {
  const c = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { returnDocument: 'after', upsert: true, session });
  return c!.seq;
}

export function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
