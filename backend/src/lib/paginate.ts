import type { Model } from 'mongoose';
import type { ListQuery } from '@gym/shared';

export async function paginate<T>(
  model: Model<T>,
  filter: Record<string, unknown>,
  q: ListQuery,
  sort: Record<string, 1 | -1> = { createdAt: -1 },
): Promise<{ data: unknown[]; page: number; limit: number; total: number }> {
  const total = await model.countDocuments(filter);
  const data = await model.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit);
  return { data, page: q.page, limit: q.limit, total };
}

export function searchFilter(search: string | undefined, fields: string[]): Record<string, unknown> {
  if (!search) return {};
  const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}
