import type { Role } from '@gym/shared';

type AnyDoc = { toObject(): Record<string, unknown> } | Record<string, unknown>;

export function baseDoc(doc: AnyDoc): Record<string, unknown> {
  const obj = typeof (doc as { toObject?: () => Record<string, unknown> }).toObject === 'function'
    ? (doc as { toObject: () => Record<string, unknown> }).toObject()
    : { ...(doc as Record<string, unknown>) };
  const { _id, __v, ...rest } = obj;
  return { _id: String(_id), ...rest };
}

export function serializeUser(doc: AnyDoc, _role: Role): Record<string, unknown> {
  const { passwordHash, ...rest } = baseDoc(doc);
  return rest;
}
