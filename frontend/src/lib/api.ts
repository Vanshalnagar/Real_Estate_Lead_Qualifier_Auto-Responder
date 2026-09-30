// All calls go to same-origin /api (proxied to the backend). No keys or backend secrets here.
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok || data?.ok === false) {
    throw new ApiError(data?.error === 'validation' ? 'Please check the highlighted fields.' : data?.error ?? `Request failed (${res.status})`, res.status, data?.issues);
  }
  return data as T;
}

export const apiBase = BASE;
