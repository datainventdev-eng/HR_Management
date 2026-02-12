'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { defaultRouteForRole, setSession } from '../lib.session';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Login failed.');

      setSession(payload);
      if (payload.user.mustChangePassword) {
        router.replace('/change-password');
      } else {
        router.replace(defaultRouteForRole(payload.user.role));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <img className="login-logo" src="/hr-logo.svg" alt="HR Managment System logo" />
        <h1>Sign In</h1>
        <p>Sign in to your account</p>
        <form onSubmit={submit} className="form-grid">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>
        <small>{error || ''}</small>
      </section>
    </main>
  );
}
