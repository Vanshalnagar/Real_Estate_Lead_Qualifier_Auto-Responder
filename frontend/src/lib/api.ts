// All calls go to same-origin /api (proxied to the backend). No keys or backend secrets here.
const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
const BASE = configuredBase.trim().replace(/\\+$/, '').replace(/\/+$/, '') || '/api';
let authTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: (() => Promise<string | null>) | null): void {
  authTokenGetter = getter;
}

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
  const normalizedPath = `/${path.replace(/^\/+/, '')}`;
  const token = authTokenGetter ? await authTokenGetter() : null;
  const res = await fetch(`${BASE}${normalizedPath}`, {
    credentials: 'include',
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
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
