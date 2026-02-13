'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, defaultRouteForRole, getSession, setSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function ChangePasswordPage() {
  const router = useRouter();
  const session = getSession();
  const requireCurrentPassword = !session?.user.mustChangePassword;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState(
    requireCurrentPassword ? 'Enter your current password and choose a new one.' : 'Set your new password to continue.',
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const activeSession = getSession();
    if (!activeSession) {
      clearSession();
      router.replace('/login');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeSession.accessToken}`,
        },
        body: JSON.stringify({
          ...(requireCurrentPassword ? { currentPassword } : {}),
          newPassword,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Password update failed.');

      const meResponse = await fetch(`${apiBase}/auth/me`, {
        headers: { Authorization: `Bearer ${activeSession.accessToken}` },
      });
      const mePayload = await meResponse.json();
      if (!meResponse.ok) throw new Error(mePayload.message ?? 'Failed to refresh profile.');

      setSession({ ...activeSession, user: { ...activeSession.user, mustChangePassword: false, ...mePayload } });
      router.replace(defaultRouteForRole(activeSession.user.role));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to update password.');
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Change Password</h1>
        <p>First login requires password update.</p>
        <form onSubmit={submit} className="form-grid">
          {requireCurrentPassword && (
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          )}
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <button type="submit">Save Password</button>
        </form>
        <FeedbackMessage message={message} />
      </section>
    </main>
  );
}
