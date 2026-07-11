import { z } from 'zod';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id');
export const money = z.number().min(0);
export const isoDate = z.coerce.date();

export const audit = z.object({
  createdBy: objectId.optional(),
  updatedBy: objectId.optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

export const apiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiError>;

// List responses: { data, page, limit, total }
export const listOut = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
  });
