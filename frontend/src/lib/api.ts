import { apiError } from '@gym/shared';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiError.safeParse(raw);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiClientError(res.status, e.code, e.message, e.fields);
    }
    throw new ApiClientError(res.status, 'UNKNOWN', `Request failed (${res.status})`);
  }
  return raw as T;
}

export const getJson = <T>(path: string): Promise<T> => api<T>(path);
export const postJson = <T>(path: string, body: unknown): Promise<T> =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patchJson = <T>(path: string, body: unknown): Promise<T> =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteJson = <T>(path: string): Promise<T> => api<T>(path, { method: 'DELETE' });
