import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { api } from '../../lib/api';

export function Login({ onLogin }: { onLogin: (email: string) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const r = await api<{ email: string }>('/admin/auth/login', { method: 'POST', json: { email: fd.get('email'), password: fd.get('password') } });
      onLogin(r.email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <img src="/images/site/cta.jpg" alt="" className="login__bg" />
      <div className="login__overlay" />
      <form className="login__card" onSubmit={submit}>
        <p className="wordmark" style={{ fontSize: 34 }}>
          NESTR<span className="wordmark__dot">.</span>
        </p>
        <div>
          <h1 className="h3">Lead desk sign-in</h1>
          <p className="body">Admins and brokers only.</p>
        </div>
        <label className="field">
          <span className="field__label">Email</span>
          <input className="input" type="email" name="email" autoComplete="username" required />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input className="input" type="password" name="password" autoComplete="current-password" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" label={busy ? 'Signing in…' : 'Sign in'} block disabled={busy} />
      </form>
    </div>
  );
}
