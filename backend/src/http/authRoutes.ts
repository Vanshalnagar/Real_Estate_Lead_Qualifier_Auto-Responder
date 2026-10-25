import { createClerkClient, verifyToken } from '@clerk/backend';
import { Router, type Request } from 'express';
import { config } from '../config.js';
import { User } from '../db/models.js';
import { asyncH } from './middleware.js';

export const authRouter = Router();
const clerk = createClerkClient({ secretKey: config.CLERK_SECRET_KEY });

function bearerToken(req: Request): string | null {
  const value = req.header('authorization') ?? '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

async function clerkUser(req: Request) {
  if (!config.CLERK_SECRET_KEY) throw new Error('Clerk customer authentication is not configured');
  const token = bearerToken(req);
  if (!token) return null;
  const claims = await verifyToken(token, {
    secretKey: config.CLERK_SECRET_KEY,
    authorizedParties: [config.PUBLIC_SITE_URL],
  });
  return clerk.users.getUser(claims.sub);
}

function publicUser(user: { _id: unknown; name: string; email: string; avatar?: string | null; providers?: string[]; createdAt: Date }) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? null,
    providers: user.providers ?? ['clerk'],
    createdAt: user.createdAt,
  };
}

async function syncCustomer(req: Request) {
  const external = await clerkUser(req);
  if (!external) return null;

  const email = external.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) throw new Error('Clerk user has no primary email address');

  let user = await User.findOne({ clerkId: external.id });
  if (!user) {
    // Link an existing account by verified email so customer data is preserved during migration.
    user = await User.findOne({ email });
  }
  if (!user) {
    user = new User({ email });
  }

  user.clerkId = external.id;
  user.email = email;
  user.name = [external.firstName, external.lastName].filter(Boolean).join(' ') || user.name || email.split('@')[0];
  user.avatar = external.imageUrl || user.avatar || null;
  user.passwordHash = null;
  user.googleId = null;
  user.providers = ['clerk'];
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

authRouter.get(
  '/me',
  asyncH(async (req, res) => {
    const user = await syncCustomer(req);
    res.json({ ok: true, user: user ? publicUser(user) : null });
  }),
);

authRouter.post('/logout', (_req, res) => {
  // Clerk owns the browser session; signOut() is called by the React client.
  res.json({ ok: true });
});

// Legacy endpoints remain explicit failures so old clients cannot create parallel local sessions.
authRouter.post('/register', (_req, res) => res.status(410).json({ ok: false, error: 'Customer registration is managed by Clerk.' }));
authRouter.post('/login', (_req, res) => res.status(410).json({ ok: false, error: 'Customer login is managed by Clerk.' }));
