'use client';

import { useEffect, useState } from 'react';
import { getSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function AnalyticsPage() {
  const [from, setFrom] = useState('2026-02-01');
  const [to, setTo] = useState('2026-02-28');
  const [month, setMonth] = useState('2026-02');
  const [message, setMessage] = useState('');

  const [headcount, setHeadcount] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leave, setLeave] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [hiring, setHiring] = useState<any[]>([]);
  const [csv, setCsv] = useState('');

  async function callApi(path: string, role: 'hr_admin' | 'manager' = 'hr_admin') {
    const session = getSession();
    const response = await fetch(`${apiBase}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        'x-role': role,
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
      const [head, att, lv, pr, hf] = await Promise.all([
        callApi('/reports/headcount', 'manager'),
        callApi(`/reports/attendance?from=${from}&to=${to}`, 'manager'),
        callApi(`/reports/leave?from=${from}&to=${to}`, 'manager'),
        callApi(`/reports/payroll?month=${month}`, 'hr_admin'),
        callApi('/reports/hiring-funnel', 'manager'),
      ]);

      setHeadcount(head);
      setAttendance(att);
      setLeave(lv);
      setPayroll(pr);
      setHiring(hf);
      setMessage('Reports refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load reports.');
    }
  }

  async function exportCsv(report: 'attendance' | 'leave' | 'payroll' | 'hiring') {
    try {
      const result = await callApi(`/reports/export?report=${report}`, report === 'payroll' ? 'hr_admin' : 'manager');
      setCsv(result.csv);
      setMessage(`${report} CSV ready.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to export CSV.');
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <main className="analytics-page">
      <header className="card">
        <h1>Analytics and Reports</h1>
        <p>Headcount, attendance, leave, payroll summary, and hiring funnel.</p>
        <div className="form-grid compact-grid">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="YYYY-MM" />
          <div className="row-actions">
            <button type="button" onClick={refreshAll}>Refresh Reports</button>
            <button type="button" onClick={() => exportCsv('attendance')}>Export Attendance CSV</button>
            <button type="button" onClick={() => exportCsv('leave')}>Export Leave CSV</button>
            <button type="button" onClick={() => exportCsv('payroll')}>Export Payroll CSV</button>
            <button type="button" onClick={() => exportCsv('hiring')}>Export Hiring CSV</button>
          </div>
        </div>
        <FeedbackMessage message={message} />
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Headcount</h2>
          <pre>{JSON.stringify(headcount, null, 2)}</pre>
        </article>
        <article className="card">
          <h2>Attendance Report</h2>
          <pre>{JSON.stringify(attendance, null, 2)}</pre>
        </article>
        <article className="card">
          <h2>Leave Report</h2>
          <pre>{JSON.stringify(leave, null, 2)}</pre>
        </article>
        <article className="card">
          <h2>Payroll Summary</h2>
          <pre>{JSON.stringify(payroll, null, 2)}</pre>
        </article>
        <article className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Hiring Funnel</h2>
          <pre>{JSON.stringify(hiring, null, 2)}</pre>
        </article>
        <article className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>CSV Output</h2>
          <pre>{csv || 'No CSV generated yet.'}</pre>
        </article>
      </section>
    </main>
  );
}
