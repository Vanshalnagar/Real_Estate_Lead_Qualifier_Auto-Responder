import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { User, type UserDoc } from '../db/models.js';
import { logger } from '../logger.js';
import { exchangeGoogleCode, googleAuthUrl, googleConfigured } from '../services/google.js';
import { asyncH } from './middleware.js';

/**
 * Customer accounts: register / login with email + password, or "Continue with Google".
 * Completely separate from the admin login: its own cookie (`nestr_user`), its own signing key
 * (derived from JWT_SECRET, so a customer token can never pass the admin check) and audience.
 */
export const authRouter = Router();

export const USER_COOKIE = 'nestr_user';
const OAUTH_COOKIE = 'nestr_oauth';
const USER_KEY = createHmac('sha256', config.JWT_SECRET).update('nestr-customer-session-v1').digest();
const secure = config.NODE_ENV === 'production';
// Compared against when the email is unknown, so both failure paths take the same time.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 12);

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { ok: false, error: 'Too many attempts — please try again in a few minutes.' } });

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Please enter a valid email').max(120),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/\d/, 'Include at least one number'),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email'),
  password: z.string().min(1, 'Please enter your password').max(128),
});

function publicUser(u: Pick<UserDoc, '_id' | 'name' | 'email' | 'avatar' | 'providers' | 'createdAt'>) {
  return { id: String(u._id), name: u.name, email: u.email, avatar: u.avatar ?? null, providers: u.providers ?? [], createdAt: u.createdAt };
}

function setSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, USER_KEY, { expiresIn: '7d', audience: 'nestr-customer' });
  res.cookie(USER_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
}

export function readUserId(req: Request): string | null {
  const token = req.cookies?.[USER_COOKIE];
  if (!token) return null;
  try {
    return (jwt.verify(token, USER_KEY, { audience: 'nestr-customer' }) as { sub: string }).sub;
  } catch {
    return null;
  }
}

/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
function safeNext(v: unknown): string {
  const s = typeof v === 'string' ? v : '';
  return /^\/(?!\/)[\w\-/?=&#.%]*$/.test(s) && !s.startsWith('/api') ? s : '/account';
}

// --- email + password --------------------------------------------------------------------------

authRouter.post(
  '/register',
  authLimiter,
  asyncH(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await User.findOne({ email: body.email });
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: existing.passwordHash ? 'An account with this email already exists — please sign in.' : 'This email is registered with Google — use “Continue with Google”.',
      });
    }
    const user = await User.create({
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 12),
      providers: ['password'],
      lastLoginAt: new Date(),
    });
    setSession(res, String(user._id));
    logger.info({ userId: String(user._id) }, 'customer registered');
    res.status(201).json({ ok: true, user: publicUser(user) });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  asyncH(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await User.findOne({ email: body.email });
    // Same message for unknown email and wrong password (no account enumeration).
    const fail = () => res.status(401).json({ ok: false, error: 'Incorrect email or password.' });
    if (!user) {
      await bcrypt.compare(body.password, DUMMY_HASH); // equalise timing
      return fail();
    }
    if (!user.passwordHash) return res.status(400).json({ ok: false, error: 'This account uses Google sign-in — use “Continue with Google”.' });
    if (!(await bcrypt.compare(body.password, user.passwordHash))) return fail();
    user.lastLoginAt = new Date();
    await user.save();
    setSession(res, String(user._id));
    res.json({ ok: true, user: publicUser(user) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(USER_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  asyncH(async (req, res) => {
    const id = readUserId(req);
    const user = id ? await User.findById(id).lean() : null;
    if (!user && id) res.clearCookie(USER_COOKIE, { path: '/' });
    res.json({ ok: true, user: user ? publicUser(user as unknown as UserDoc) : null, google: googleConfigured() });
  }),
);

// --- Google --------------------------------------------------------------------------------------

/** Step 1: redirect to Google with a random `state` bound to this browser (httpOnly cookie). */
authRouter.get('/google', authLimiter, (req, res) => {
  if (!googleConfigured()) return res.redirect('/login?error=google_not_configured');
  const state = randomBytes(24).toString('base64url');
  const next = safeNext(req.query.next);
  // SameSite=Lax so the cookie is sent back on Google's top-level redirect to our callback.
  res.cookie(OAUTH_COOKIE, JSON.stringify({ state, next }), { httpOnly: true, sameSite: 'lax', secure, maxAge: 10 * 60 * 1000, path: '/api/auth/google' });
  res.redirect(googleAuthUrl(state));
});

/** Step 2: Google redirects back with ?code&state. Verify state, exchange code, sign the user in. */
authRouter.get(
  '/google/callback',
  asyncH(async (req, res) => {
    let saved: { state?: string; next?: string } = {};
    try {
      saved = JSON.parse(req.cookies?.[OAUTH_COOKIE] ?? '{}');
    } catch {
      /* invalid cookie */
    }
    res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/google' });
    const state = String(req.query.state ?? '');
    const code = String(req.query.code ?? '');
    const stateOk = Boolean(saved.state && state && saved.state.length === state.length && timingSafeEqual(Buffer.from(saved.state), Buffer.from(state)));
    if (req.query.error) return res.redirect('/login?error=google_cancelled');
    if (!stateOk || !code) {
      logger.warn('Google sign-in rejected: state mismatch or missing code');
      return res.redirect('/login?error=google_state');
    }
    try {
      const g = await exchangeGoogleCode(code);
      let user = await User.findOne({ googleId: g.sub });
      if (!user) {
        user = await User.findOne({ email: g.email });
        if (user) {
          // Link Google to an existing email account (Google verified the address).
          user.googleId = g.sub;
          if (!user.providers.includes('google')) user.providers.push('google');
          if (!user.avatar && g.picture) user.avatar = g.picture;
        } else {
          user = new User({ name: g.name, email: g.email, googleId: g.sub, avatar: g.picture, providers: ['google'] });
        }
      }
      user.lastLoginAt = new Date();
      await user.save();
      setSession(res, String(user._id));
      logger.info({ userId: String(user._id) }, 'customer signed in with Google');
      res.redirect(safeNext(saved.next));
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'Google sign-in failed');
      res.redirect('/login?error=google_failed');
    }
  }),
);
