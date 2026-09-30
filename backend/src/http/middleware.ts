import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { ZodError, type ZodSchema } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const AUTH_COOKIE = 'nestr_admin';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** n8n → backend internal API. */
export function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  const got = req.header('x-internal-secret') ?? '';
  if (!got || !safeEqual(got, config.INTERNAL_API_SECRET)) {
    logger.warn({ path: req.path, ip: req.ip }, 'internal API call rejected');
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

export interface AdminClaims {
  sub: string;
  email: string;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return res.status(401).json({ ok: false, error: 'not signed in' });
  try {
    (req as Request & { admin: AdminClaims }).admin = jwt.verify(token, config.JWT_SECRET) as AdminClaims;
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'session expired' });
  }
}

export const publicLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { ok: false, error: 'Too many requests — please wait a minute.' } });
export const formLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { ok: false, error: 'Too many submissions — please try again later.' } });
export const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { ok: false, error: 'Too many login attempts.' } });

/** Honeypot inputs kept from the template's forms. Real users never fill them. */
export const HONEYPOT_FIELDS = ['website', 'company', 'subject', 'title', 'description', 'feedback', 'notes', 'details', 'remarks', 'comments'];
export function isBot(body: Record<string, unknown>): boolean {
  return HONEYPOT_FIELDS.some((f) => typeof body?.[f] === 'string' && (body[f] as string).trim() !== '');
}

export function parse<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export const asyncH =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ ok: false, error: 'validation', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  logger.error({ err: (err as Error).message, stack: (err as Error).stack, path: req.path }, 'request failed');
  res.status(500).json({ ok: false, error: 'internal error' });
}
