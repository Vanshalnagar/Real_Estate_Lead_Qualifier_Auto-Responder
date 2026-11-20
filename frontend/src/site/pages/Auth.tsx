import { SignIn, SignUp } from '@clerk/react';
import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { useAuth } from '../../lib/auth';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    document.title = `${mode === 'login' ? 'Sign in' : 'Create account'} | NESTR.`;
  }, [mode]);

  if (!loading && user) return <Navigate to="/account" replace />;

  return (
    <section className="auth frame">
      {mode === 'login' ? (
        <SignIn routing="path" path="/login" signUpUrl="/register" fallbackRedirectUrl="/account" />
      ) : (
        <SignUp routing="path" path="/register" signInUrl="/login" fallbackRedirectUrl="/account" />
      )}
    </section>
  );
}

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
    .map((part) => part[0])
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
            {user.avatar ? (
              <img src={user.avatar} alt="" className="account__avatar" referrerPolicy="no-referrer" />
            ) : (
              <span className="account__avatar account__avatar--initials">{initials}</span>
            )}
            <div>
              <h1 className="h3">Hi, {user.name.split(' ')[0]}</h1>
              <p className="body">{user.email}</p>
              <div className="account__tags">
                <span className="pill">Clerk account</span>
                <span className="pill pill--muted">
                  Member since {new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
          <div className="account__actions">
            <Button label="Browse properties" onClick={() => nav('/buy')} />
            <Button
              label="Sign out"
              variant="dark"
              chevron={false}
              onClick={async () => {
                await logout();
                nav('/');
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
