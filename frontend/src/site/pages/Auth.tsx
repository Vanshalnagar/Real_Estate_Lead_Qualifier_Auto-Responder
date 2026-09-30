import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../../components/Button';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';

/** Mirrors backend/src/http/authRoutes.ts registerSchema. */
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  email: z.string().trim().email('Please enter a valid email').max(120),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/\d/, 'Include at least one number'),
});
const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email'),
  password: z.string().min(1, 'Please enter your password'),
});

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_state: 'Your Google sign-in session expired — please try again.',
  google_failed: 'Google sign-in failed — please try again or use email.',
  google_not_configured: 'Google sign-in is not configured yet — please use email.',
};

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function strength(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

/** Sign in / create account, styled like the template's glass CTA form. */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, loading, login, register, googleEnabled } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const next = params.get('next') && /^\/(?!\/)/.test(params.get('next')!) ? params.get('next')! : '/account';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState(GOOGLE_ERRORS[params.get('error') ?? ''] ?? '');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    document.title = `${mode === 'login' ? 'Sign in' : 'Create account'} | NESTR.`;
    setErrors({});
  }, [mode]);

  if (!loading && user) return <Navigate to={next} replace />;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const parsed = (mode === 'register' ? registerSchema : loginSchema).safeParse(raw);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setMessage('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const d = parsed.data as z.infer<typeof registerSchema>;
        await register(d.name, d.email, d.password);
      } else {
        const d = parsed.data as z.infer<typeof loginSchema>;
        await login(d.email, d.password);
      }
      nav(next, { replace: true });
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.issues) setErrors(Object.fromEntries(e2.issues.map((i) => [i.path, i.message])));
      setMessage(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const googleHref = `/api/auth/google?next=${encodeURIComponent(next)}`;
  const s = strength(pw);
  const field = (name: string, el: JSX.Element, label: string) => (
    <label className={`field ${errors[name] ? 'field--invalid' : ''}`}>
      <span className="field__label">{label}</span>
      {el}
      {errors[name] && <span className="field__error">{errors[name]}</span>}
    </label>
  );

  return (
    <section className="auth frame">
      <div className="auth__box">
        <img src="/images/site/cta.jpg" alt="" className="auth__bg" />
        <div className="cta__overlay" />
        <div className="auth__inner">
          <div className="auth__intro">
            <span className="eyebrow">
              <span className="slashes">//</span> {mode === 'login' ? 'Welcome back' : 'Join NESTR.'}
            </span>
            <h1 className="h2">{mode === 'login' ? 'Sign in to your account' : 'Create your free account'}</h1>
            <p className="body body-2">Save your searches, pick up your property conversations where you left off, and get matched faster.</p>
          </div>

          <motion.div className="auth__card" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 168, damping: 30 }}>
            <div className="auth__tabs" role="tablist">
              <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-active' : ''}>
                Sign in
              </Link>
              <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-active' : ''}>
                Create account
              </Link>
              <motion.span className="auth__tab-ink" layout animate={{ x: mode === 'login' ? '0%' : '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
            </div>

            <a className={`auth__google ${googleEnabled ? '' : 'is-disabled'}`} href={googleEnabled ? googleHref : undefined} aria-disabled={!googleEnabled} data-cursor="Google">
              <GoogleLogo />
              <span>Continue with Google</span>
            </a>
            <div className="auth__or">
              <span>or with email</span>
            </div>

            <form className="auth__form" onSubmit={onSubmit} noValidate aria-label={mode === 'login' ? 'Sign in form' : 'Create account form'}>
              <AnimatePresence initial={false}>
                {mode === 'register' && (
                  <motion.div key="name" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                    {field('name', <input className="input" name="name" autoComplete="name" placeholder="Full name" />, 'Name')}
                  </motion.div>
                )}
              </AnimatePresence>
              {field('email', <input className="input" type="email" name="email" autoComplete="email" placeholder="you@example.com" />, 'Email')}
              {field(
                'password',
                <div className="auth__pw">
                  <input
                    className="input"
                    type={showPw ? 'text' : 'password'}
                    name="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters, a letter and a number'}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                  />
                  <button type="button" className="auth__eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>,
                'Password',
              )}
              {mode === 'register' && pw && (
                <div className="auth__strength" aria-label={`Password strength ${s} of 4`}>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={i < s ? `on s${s}` : ''} />
                  ))}
                  <em>{['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][s]}</em>
                </div>
              )}
              {message && (
                <p className="form-error" role="alert">
                  {message}
                </p>
              )}
              <Button type="submit" label={busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} block disabled={busy} />
            </form>
            <p className="auth__switch">
              {mode === 'login' ? (
                <>
                  New to NESTR.? <Link to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link>
                </>
              ) : (
                <>
                  Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
                </>
              )}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/** Minimal account page: profile + sign out. */
export function AccountPage() {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    document.title = 'My account | NESTR.';
  }, []);
  if (loading) return <div className="pd-loading" />;
  if (!user) return <Navigate to="/login?next=/account" replace />;
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <section className="frame account">
      <div className="panel">
        <div className="container account__inner">
          <span className="eyebrow">
            <span className="slashes">//</span> My account
          </span>
          <div className="account__card">
            {user.avatar ? <img src={user.avatar} alt="" className="account__avatar" referrerPolicy="no-referrer" /> : <span className="account__avatar account__avatar--initials">{initials}</span>}
            <div>
              <h1 className="h3">Hi, {user.name.split(' ')[0]}</h1>
              <p className="body">{user.email}</p>
              <div className="account__tags">
                {user.providers.map((p) => (
                  <span key={p} className="pill">
                    {p === 'google' ? 'Google' : 'Email & password'}
                  </span>
                ))}
                <span className="pill pill--muted">Member since {new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
          <div className="account__actions">
            <Button label="Browse properties" onClick={() => nav('/buy')} />
            <Button label="Sign out" variant="dark" chevron={false} onClick={async () => { await logout(); nav('/'); }} />
          </div>
        </div>
      </div>
    </section>
  );
}
