'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

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
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    role: 'employee' as 'employee' | 'manager' | 'hr_admin',
    employeeId: '',
    joinDate: '',
    departmentId: '',
    title: '',
    managerId: '',
    status: 'active' as 'active' | 'inactive',
  });
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [managers, setManagers] = useState<Array<{ id: string; fullName: string }>>([]);
  const [message, setMessage] = useState('');
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');

  async function loadSupportData() {
    const session = getSession();
    if (!session) return;

    const [deptRes, empRes] = await Promise.all([
      fetch(`${apiBase}/core-hr/departments`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-role': 'hr_admin',
        },
      }),
      fetch(`${apiBase}/core-hr/employees`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-role': 'hr_admin',
        },
      }),
    ]);

    const deptPayload = await deptRes.json();
    const empPayload = await empRes.json();
    if (deptRes.ok) setDepartments(deptPayload);
    if (empRes.ok) setManagers(empPayload);
  }

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
          joinDate: form.joinDate || undefined,
          departmentId: form.departmentId || undefined,
          title: form.title || undefined,
          managerId: form.managerId || undefined,
          status: form.status,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Failed to create user.');

      setCreatedUser(payload.user);
      setTemporaryPassword(payload.temporaryPassword);
      setMessage('User created. Share temporary password securely.');
      setForm({
        email: '',
        fullName: '',
        role: 'employee',
        employeeId: '',
        joinDate: '',
        departmentId: '',
        title: '',
        managerId: '',
        status: 'active',
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to create user.');
    }
  }

  useEffect(() => {
    loadSupportData();
  }, []);

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
            {(form.role === 'employee' || form.role === 'manager') && (
              <>
                <label>
                  Join Date
                  <input
                    type="date"
                    aria-label="Join Date"
                    value={form.joinDate}
                    onChange={(e) => setForm((p) => ({ ...p, joinDate: e.target.value }))}
                  />
                </label>
                <select value={form.departmentId} onChange={(e) => setForm((p) => ({ ...p, departmentId: e.target.value }))}>
                  <option value="">Select department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <input placeholder="Role/Title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
                <label>
                  Reporting Manager
                  <select value={form.managerId} onChange={(e) => setForm((p) => ({ ...p, managerId: e.target.value }))}>
                    <option value="">No manager</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>{m.fullName}</option>
                    ))}
                  </select>
                </label>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'active' | 'inactive' }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </>
            )}
            <button type="submit">Create Account</button>
          </form>
          <small>Employee/manager profile is created and linked automatically during account creation.</small>
          <FeedbackMessage message={message} />
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
