import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, deleteJson, getJson, postJson } from './api';

function mockFetchOnce(status: number, body: unknown, ok = status >= 200 && status < 300) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getJson', () => {
  it('returns the response body when the request is ok', async () => {
    mockFetchOnce(200, { data: { id: '1', name: 'Widget' } });
    const result = await getJson<{ data: { id: string; name: string } }>('/materials/1');
    expect(result).toEqual({ data: { id: '1', name: 'Widget' } });
  });

  it('throws ApiClientError with code, message and fields from the API error envelope', async () => {
    mockFetchOnce(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Name is required', fields: { name: 'required' } },
    });

    await expect(getJson('/materials')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Name is required',
      fields: { name: 'required' },
    });
  });

  it('throws ApiClientError with code UNKNOWN and the status in the message for a non-JSON error response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });
    vi.stubGlobal('fetch', fetchMock);

    let caught: unknown;
    try {
      await getJson('/materials');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ApiClientError);
    const err = caught as ApiClientError;
    expect(err.code).toBe('UNKNOWN');
    expect(err.status).toBe(500);
    expect(err.message).toContain('500');
  });
});

describe('request headers and credentials', () => {
  it('sends Content-Type application/json and credentials include for requests with a body', async () => {
    const fetchMock = mockFetchOnce(200, { data: null });
    await postJson('/auth/login', { email: 'a@b.com', password: 'secret' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/login');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.com', password: 'secret' }));
  });

  it('sends credentials include but no Content-Type for bodyless requests', async () => {
    const fetchMock = mockFetchOnce(200, { data: null });
    await deleteJson('/materials/1');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect(init.headers ?? {}).not.toHaveProperty('Content-Type');
  });
});
