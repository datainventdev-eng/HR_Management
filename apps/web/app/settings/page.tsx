'use client';

import { useMemo, useState } from 'react';
import { getSession, setSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function SettingsPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const session = getSession();

  const employeeId = useMemo(() => session?.user.employeeId || session?.user.id || '', [session]);

  async function copy(label: string, value: string) {
    if (!value) {
      setMessage(`${label} is empty.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Failed to copy ${label}.`);
    }
  }

  async function refreshAccessToken() {
    if (!session?.refreshToken) {
      setMessage('No refresh token found.');
      return;
    }
    try {
      setBusy(true);
      const response = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to refresh token.');
      }
      setSession(payload);
      setMessage('Access token refreshed. You can copy the new token now.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to refresh token.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="core-hr-page">
      <header className="card">
        <h1>Settings</h1>
        <p>MCP setup values for this logged in user.</p>
        <FeedbackMessage message={message} />
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>MCP Values</h2>
          <div className="form-grid">
            <label>
              HR_API_URL
              <input value={apiBase} readOnly />
            </label>
            <button type="button" onClick={() => copy('HR_API_URL', apiBase)}>Copy HR_API_URL</button>

            <label>
              HR_EMPLOYEE_ID
              <input value={employeeId} readOnly />
            </label>
            <button type="button" onClick={() => copy('HR_EMPLOYEE_ID', employeeId)}>Copy HR_EMPLOYEE_ID</button>

            <label>
              HR_ROLE
              <input value={session?.user.role || ''} readOnly />
            </label>
            <button type="button" onClick={() => copy('HR_ROLE', session?.user.role || '')}>Copy HR_ROLE</button>
          </div>
        </article>

        <article className="card">
          <h2>Access Token</h2>
          <div className="form-grid">
            <button type="button" onClick={() => setShowTokens((current) => !current)}>
              {showTokens ? 'Hide Token' : 'Show Token'}
            </button>
            <label>
              HR_ACCESS_TOKEN
              <textarea value={showTokens ? (session?.accessToken || '') : '********'} readOnly rows={6} />
            </label>
            <div className="row-actions">
              <button type="button" onClick={() => copy('HR_ACCESS_TOKEN', session?.accessToken || '')}>
                Copy HR_ACCESS_TOKEN
              </button>
              <button type="button" onClick={refreshAccessToken} disabled={busy}>
                {busy ? 'Refreshing...' : 'Refresh Token'}
              </button>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
