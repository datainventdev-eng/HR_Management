'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

type ComponentRow = { id: string; employeeId: string; type: 'earning' | 'deduction'; name: string; amount: number };
type EntryRow = { employeeId: string; month: string; gross: number; deductions: number; net: number; status: 'Draft' | 'Finalized' };
type PayslipRow = { id: string; employeeId: string; month: string; gross: number; deductions: number; net: number };

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function PayrollPage() {
  const [employeeId, setEmployeeId] = useState('emp_demo_1');
  const [month, setMonth] = useState('2026-02');
  const [message, setMessage] = useState('');

  const [componentForm, setComponentForm] = useState({
    employeeId: 'emp_demo_1',
    type: 'earning' as 'earning' | 'deduction',
    name: 'Basic Salary',
    amount: 2000,
    effectiveFrom: '2026-01-01',
  });

  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);

  async function callApi(path: string, init?: RequestInit, role: 'hr_admin' | 'employee' = 'hr_admin', id?: string) {
    const session = getSession();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        'x-role': role,
        'x-employee-id': id || employeeId,
        ...(init?.headers || {}),
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message ?? 'Request failed.');
    }

    return payload;
  }

  async function refreshAll() {
    try {
      const [comp, ent, slip] = await Promise.all([
        callApi(`/payroll/components?employeeId=${employeeId}`),
        callApi(`/payroll/entries?employeeId=${employeeId}&month=${month}`),
        callApi(`/payroll/payslips?employeeId=${employeeId}`),
      ]);
      setComponents(comp);
      setEntries(ent);
      setPayslips(slip);
      setMessage('Payroll data refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load payroll data.');
    }
  }

  async function seedDemo() {
    try {
      const res = await callApi('/payroll/seed-demo', { method: 'POST' });
      setMessage(res.message);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to seed demo data.');
    }
  }

  async function addComponent(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/payroll/components', { method: 'POST', body: JSON.stringify(componentForm) });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add component.');
    }
  }

  async function runDraft() {
    try {
      await callApi('/payroll/run-draft', {
        method: 'POST',
        body: JSON.stringify({ month, employeeIds: [employeeId] }),
      });
      setMessage('Payroll draft generated.');
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to run payroll draft.');
    }
  }

  async function finalize() {
    try {
      await callApi('/payroll/finalize', {
        method: 'POST',
        body: JSON.stringify({ month, employeeIds: [employeeId] }),
      });
      setMessage('Payroll finalized and payslip generated.');
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to finalize payroll.');
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <main className="payroll-page">
      <header className="card">
        <h1>Payroll</h1>
        <p>Simple salary components, monthly payroll run, finalize, and payslips.</p>
        <div className="form-grid compact-grid">
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Employee ID" />
          <input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="YYYY-MM" />
          <div className="row-actions">
            <button type="button" onClick={seedDemo}>Seed Demo</button>
            <button type="button" onClick={refreshAll}>Refresh</button>
            <button type="button" onClick={runDraft}>Run Draft</button>
            <button type="button" onClick={finalize}>Finalize</button>
          </div>
        </div>
        <FeedbackMessage message={message} />
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Add Salary Component</h2>
          <form onSubmit={addComponent} className="form-grid">
            <input
              value={componentForm.employeeId}
              onChange={(e) => setComponentForm((p) => ({ ...p, employeeId: e.target.value }))}
              placeholder="Employee ID"
            />
            <select
              value={componentForm.type}
              onChange={(e) => setComponentForm((p) => ({ ...p, type: e.target.value as 'earning' | 'deduction' }))}
            >
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
            </select>
            <input value={componentForm.name} onChange={(e) => setComponentForm((p) => ({ ...p, name: e.target.value }))} />
            <input
              type="number"
              min={0}
              value={componentForm.amount}
              onChange={(e) => setComponentForm((p) => ({ ...p, amount: Number(e.target.value) }))}
            />
            <input
              type="date"
              value={componentForm.effectiveFrom}
              onChange={(e) => setComponentForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
            />
            <button type="submit">Save Component</button>
          </form>
          <ul className="simple-list">
            {components.map((c) => (
              <li key={c.id}>{c.name} ({c.type}) - {c.amount}</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Payroll Entries</h2>
          <ul className="simple-list">
            {entries.map((e, idx) => (
              <li key={`${e.employeeId}-${e.month}-${idx}`}>
                {e.month}: gross {e.gross}, deductions {e.deductions}, net {e.net} ({e.status})
              </li>
            ))}
          </ul>
        </article>

        <article className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Payslips</h2>
          <ul className="simple-list">
            {payslips.map((p) => (
              <li key={p.id}>Payslip {p.month} - net {p.net} (employee {p.employeeId})</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
