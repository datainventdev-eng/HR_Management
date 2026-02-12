'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '../lib.session';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type CreatedUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'employee' | 'manager' | 'hr_admin';
  employeeId?: string;
  mustChangePassword: boolean;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', fullName: '', role: 'employee' as 'employee' | 'manager' | 'hr_admin', employeeId: '' });
  const [message, setMessage] = useState('');
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');

  async function createUser(event: FormEvent) {
    event.preventDefault();
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/auth/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          email: form.email,
          fullName: form.fullName,
          role: form.role,
          employeeId: form.employeeId || undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Failed to create user.');

      setCreatedUser(payload.user);
      setTemporaryPassword(payload.temporaryPassword);
      setMessage('User created. Share temporary password securely.');
      setForm({ email: '', fullName: '', role: 'employee', employeeId: '' });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to create user.');
    }
  }

  return (
    <main className="core-hr-page">
      <header className="card">
        <h1>User Access Provisioning</h1>
        <p>HR Admin creates all accounts. Public signup is disabled.</p>
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Create User</h2>
          <form onSubmit={createUser} className="form-grid">
            <input type="email" placeholder="Work email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
            <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} required />
            <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as typeof p.role }))}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="hr_admin">HR Admin</option>
            </select>
            <input
              placeholder="Employee profile ID (optional)"
              value={form.employeeId}
              onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}
            />
            <button type="submit">Create Account</button>
          </form>
          <small>{message}</small>
        </article>

        <article className="card">
          <h2>Provisioning Result</h2>
          {createdUser ? (
            <div className="simple-list">
              <li>Email: {createdUser.email}</li>
              <li>Role: {createdUser.role}</li>
              <li>Must change password: {createdUser.mustChangePassword ? 'Yes' : 'No'}</li>
              <li>Temporary password: {temporaryPassword}</li>
            </div>
          ) : (
            <p>No user created yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}
