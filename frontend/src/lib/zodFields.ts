import type { ZodError } from 'zod';

/**
 * Maps a ZodError to the same { fieldPath: message } shape the backend's errorHandler
 * produces for its VALIDATION responses, so client-side schema failures flow through
 * the identical FormDialog Alert + fieldError(name) path as server-side ones.
 */
export function zodErrorToFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message;
  return fields;
}
