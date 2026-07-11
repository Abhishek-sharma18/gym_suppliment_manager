import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { materialCreate } from '@gym/shared';
import { zodErrorToFields } from './zodFields';

function fieldsFor(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('expected schema to fail');
  return zodErrorToFields(result.error);
}

describe('zodErrorToFields', () => {
  it('maps a trimmed-empty name and a non-positive number to their field keys (reviewer repro)', () => {
    const fields = fieldsFor(materialCreate, {
      name: '   ',
      buyUnit: 'bag',
      useUnit: 'kg',
      conversionFactor: 0,
      reorderLevel: 0,
    });

    expect(Object.keys(fields).sort()).toEqual(['conversionFactor', 'name']);
    expect(fields.name).toEqual(expect.any(String));
    expect(fields.name.length).toBeGreaterThan(0);
    expect(fields.conversionFactor).toEqual(expect.any(String));
    expect(fields.conversionFactor.length).toBeGreaterThan(0);
  });

  it('joins nested paths with dots, matching the backend errorHandler mapping', () => {
    const schema = z.object({ items: z.array(z.object({ qty: z.number().positive() })) });
    const fields = fieldsFor(schema, { items: [{ qty: -1 }] });

    expect(Object.keys(fields)).toEqual(['items.0.qty']);
  });

  it("uses '_' for issues without a path (top-level type mismatch)", () => {
    const fields = fieldsFor(z.string(), 42);

    expect(Object.keys(fields)).toEqual(['_']);
    expect(fields._).toEqual(expect.any(String));
  });

  it('keeps the last message when multiple issues share a path', () => {
    const schema = z.object({ name: z.string().min(5).regex(/^[a-z]+$/) });
    const fields = fieldsFor(schema, { name: 'A1' });

    expect(Object.keys(fields)).toEqual(['name']);
    expect(fields.name).toEqual(expect.any(String));
  });
});
