/**
 * Customer accounts against the running stack, through the Vite proxy like a browser:
 * register, login, session, logout, validation, Google OAuth start + callback guards, and
 * isolation from the admin session.
 */
import { describe, expect, it } from 'vitest';

const SITE = process.env.SITE_URL ?? 'http://localhost:5173';
const email = `buyer.${Date.now()}@example.com`;
const password = 'Sunrise2026home';

function cookieFrom(res: Response, name: string) {
  const all = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const c = all.find((x) => x.startsWith(`${name}=`));
  return c ? { pair: c.split(';')[0], raw: c } : null;
}
async function post(path: string, body: unknown, cookie = '') {
  const res = await fetch(`${SITE}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { res, data: (await res.json()) as any };
}

describe('customer accounts', () => {
  let session = '';

  it('register creates the account and sets an httpOnly session cookie', async () => {
    const { res, data } = await post('/auth/register', { name: 'Asha Menon', email, password });
    expect(res.status).toBe(201);
    expect(data.user).toMatchObject({ name: 'Asha Menon', email, providers: ['password'] });
    expect(data.user.passwordHash).toBeUndefined();
    const c = cookieFrom(res, 'nestr_user');
    expect(c?.raw).toMatch(/HttpOnly/i);
    expect(c?.raw).toMatch(/SameSite=Lax/i);
    session = c!.pair;
  });

  it('/me returns the signed-in user; anonymous gets null', async () => {
    const me = await (await fetch(`${SITE}/api/auth/me`, { headers: { Cookie: session } })).json();
    expect(me.user.email).toBe(email);
    expect(me.google).toBe(true);
    const anon = await (await fetch(`${SITE}/api/auth/me`)).json();
    expect(anon.user).toBeNull();
  });

  it('duplicate email is rejected (case-insensitive)', async () => {
    const { res, data } = await post('/auth/register', { name: 'Asha', email: email.toUpperCase(), password });
    expect(res.status).toBe(409);
    expect(data.error).toMatch(/already exists/);
  });

  it('weak passwords and bad emails fail validation', async () => {
    const { res, data } = await post('/auth/register', { name: 'A', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(data.issues.map((i: any) => i.path)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('login works with the right password, generic error otherwise', async () => {
    const ok = await post('/auth/login', { email, password });
    expect(ok.res.status).toBe(200);
    expect(cookieFrom(ok.res, 'nestr_user')).toBeTruthy();
    const bad = await post('/auth/login', { email, password: 'Wrong12345' });
    const unknown = await post('/auth/login', { email: 'nobody.here@example.com', password: 'Wrong12345' });
    expect(bad.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(bad.data.error).toBe(unknown.data.error); // no account enumeration
  });

  it('a customer session cannot access the admin API', async () => {
    const token = session.split('=')[1];
    const res = await fetch(`${SITE}/api/admin/leads`, { headers: { Cookie: `nestr_admin=${token}` } });
    expect(res.status).toBe(401);
  });

  it('logout clears the session cookie', async () => {
    const { res } = await post('/auth/logout', {}, session);
    expect(cookieFrom(res, 'nestr_user')?.raw).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('Google start redirects to Google with our client id, redirect URI and a state cookie', async () => {
    const res = await fetch(`${SITE}/api/auth/google?next=/buy`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(loc.searchParams.get('client_id')).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(loc.searchParams.get('redirect_uri')).toBe(`${SITE}/api/auth/google/callback`);
    expect(loc.searchParams.get('scope')).toBe('openid email profile');
    const state = loc.searchParams.get('state')!;
    expect(state.length).toBeGreaterThan(20);
    const c = cookieFrom(res, 'nestr_oauth');
    expect(c?.raw).toMatch(/HttpOnly/i);
    expect(decodeURIComponent(c!.pair)).toContain(state);
    expect(loc.toString()).not.toMatch(/GOCSPX/); // the client secret never leaves the server
  });

  it('Google callback rejects a forged/missing state (CSRF) and user cancellation', async () => {
    const forged = await fetch(`${SITE}/api/auth/google/callback?code=abc&state=forged`, { redirect: 'manual' });
    expect(forged.headers.get('location')).toBe('/login?error=google_state');
    const cancelled = await fetch(`${SITE}/api/auth/google/callback?error=access_denied&state=x`, { redirect: 'manual' });
    expect(cancelled.headers.get('location')).toBe('/login?error=google_cancelled');
  });

  it('Google callback with a valid state but a bad code fails safely', async () => {
    const start = await fetch(`${SITE}/api/auth/google?next=/account`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const oauth = cookieFrom(start, 'nestr_oauth')!.pair;
    const cb = await fetch(`${SITE}/api/auth/google/callback?code=invalid-code&state=${state}`, { redirect: 'manual', headers: { Cookie: oauth } });
    expect(cb.headers.get('location')).toBe('/login?error=google_failed');
    expect(cookieFrom(cb, 'nestr_user')).toBeNull();
  });

  it('open redirects are blocked', async () => {
    const res = await fetch(`${SITE}/api/auth/google?next=//evil.example`, { redirect: 'manual' });
    const c = decodeURIComponent(cookieFrom(res, 'nestr_oauth')!.pair);
    expect(c).toContain('"next":"/account"');
  });
});
