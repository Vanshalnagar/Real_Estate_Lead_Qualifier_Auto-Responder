import { config } from '../config.js';

/** Google OAuth 2.0 (authorization-code flow) for customer sign-in. Server-side only. */

export function googleConfigured(): boolean {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return config.GOOGLE_REDIRECT_URI || `${config.PUBLIC_SITE_URL.replace(/\/$/, '')}/api/auth/google/callback`;
}

export function googleAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
    include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

/**
 * Exchanges the one-time code for tokens and validates the returned ID token with Google's
 * tokeninfo endpoint: audience must be our client id, issuer Google, email verified, not expired.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const tokens = (await tokenRes.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!tokenRes.ok || !tokens.id_token) throw new Error(`token exchange failed: ${tokens.error ?? tokenRes.status}`);

  const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`, { signal: AbortSignal.timeout(15000) });
  const info = (await infoRes.json()) as Record<string, string>;
  if (!infoRes.ok) throw new Error('id token rejected by Google');
  if (info.aud !== config.GOOGLE_CLIENT_ID) throw new Error('id token audience mismatch');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new Error('id token issuer mismatch');
  if (String(info.email_verified) !== 'true') throw new Error('Google email not verified');
  if (Number(info.exp) * 1000 < Date.now()) throw new Error('id token expired');
  return { sub: info.sub, email: info.email.toLowerCase(), name: info.name || info.email.split('@')[0], picture: info.picture || null };
}
