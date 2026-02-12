'use client';

import { FormEvent, useMemo, useState } from 'react';

type Sheet = {
  id: string;
  employeeId: string;
  managerId: string;
  weekStartDate: string;
  totalHours: number;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected';
  managerComment?: string;
  history: Array<{ status: string; at: string; comment?: string }>;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function TimesheetsPage() {
  const [employeeId, setEmployeeId] = useState('emp_demo_1');
  const [managerId, setManagerId] = useState('mgr_demo_1');
  const [message, setMessage] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('2026-02-09');
  const [entries, setEntries] = useState([
    { day: 'Mon', hours: 8 },
    { day: 'Tue', hours: 8 },
    { day: 'Wed', hours: 8 },
    { day: 'Thu', hours: 8 },
    { day: 'Fri', hours: 8 },
  ]);
  const [decision, setDecision] = useState({ timesheetId: '', decision: 'Approved' as 'Approved' | 'Rejected', managerComment: '' });
  const [sheets, setSheets] = useState<Sheet[]>([]);

  const totalDraftHours = useMemo(() => entries.reduce((sum, entry) => sum + entry.hours, 0), [entries]);

  async function callApi(path: string, init?: RequestInit, role: 'employee' | 'manager' | 'hr_admin' = 'employee', id?: string) {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
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

  async function seedDemo() {
    try {
      const result = await callApi('/timesheet/seed-demo', { method: 'POST' }, 'hr_admin');
      setMessage(result.message);
      await refreshSheets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to seed demo baseline.');
    }
  }

  async function mapManager() {
    try {
      await callApi(
        '/timesheet/manager-map',
        {
          method: 'POST',
          body: JSON.stringify({ employeeId, managerId }),
        },
        'hr_admin',
      );
      setMessage('Manager mapping saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save manager mapping.');
    }
  }

  async function submitTimesheet(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi(
        '/timesheet/submit',
        {
          method: 'POST',
          body: JSON.stringify({ weekStartDate, entries }),
        },
        'employee',
        employeeId,
      );
      setMessage('Timesheet submitted.');
      await refreshSheets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to submit timesheet.');
    }
  }

  async function refreshSheets() {
    try {
      const employeeSheets = await callApi('/timesheet/list', undefined, 'employee', employeeId);
      setSheets(employeeSheets);
      setMessage('Timesheets refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load timesheets.');
    }
  }

  async function loadManagerQueue() {
    try {
      const managerSheets = await callApi('/timesheet/list', undefined, 'manager', managerId);
      setSheets(managerSheets);
      setMessage('Manager queue loaded.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load manager queue.');
    }
  }

  async function submitDecision(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/timesheet/decision', { method: 'POST', body: JSON.stringify(decision) }, 'manager', managerId);
      setDecision({ timesheetId: '', decision: 'Approved', managerComment: '' });
      await loadManagerQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to decide timesheet.');
    }
  }

  function updateHours(index: number, value: number) {
    setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, hours: Number.isNaN(value) ? 0 : value } : entry)));
  }

  return (
    <main className="timesheet-page">
      <header className="card">
        <h1>Timesheets</h1>
        <p>Weekly hour submission with manager approval and status history.</p>
        <div className="form-grid compact-grid">
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Employee ID" />
          <input value={managerId} onChange={(e) => setManagerId(e.target.value)} placeholder="Manager ID" />
          <div className="row-actions">
            <button type="button" onClick={seedDemo}>Seed Demo</button>
            <button type="button" onClick={mapManager}>Save Manager Map</button>
            <button type="button" onClick={refreshSheets}>My Timesheets</button>
            <button type="button" onClick={loadManagerQueue}>Manager Queue</button>
          </div>
        </div>
        <small>{message}</small>
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Submit Weekly Timesheet (Employee)</h2>
          <form onSubmit={submitTimesheet} className="form-grid">
            <input type="date" value={weekStartDate} onChange={(e) => setWeekStartDate(e.target.value)} required />
            {entries.map((entry, idx) => (
              <label key={entry.day} className="hours-row">
                <span>{entry.day}</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={entry.hours}
                  onChange={(e) => updateHours(idx, Number(e.target.value))}
                />
              </label>
            ))}
            <div>Total draft hours: {totalDraftHours}</div>
            <button type="submit">Submit Timesheet</button>
          </form>
        </article>

        <article className="card">
          <h2>Manager Decision</h2>
          <form onSubmit={submitDecision} className="form-grid">
            <select
              value={decision.timesheetId}
              onChange={(e) => setDecision((prev) => ({ ...prev, timesheetId: e.target.value }))}
              required
            >
              <option value="">Select submitted timesheet</option>
              {sheets.filter((sheet) => sheet.status === 'Submitted').map((sheet) => (
                <option key={sheet.id} value={sheet.id}>{sheet.id}</option>
              ))}
            </select>
            <select
              value={decision.decision}
              onChange={(e) => setDecision((prev) => ({ ...prev, decision: e.target.value as 'Approved' | 'Rejected' }))}
            >
              <option value="Approved">Approve</option>
              <option value="Rejected">Reject</option>
            </select>
            <input
              placeholder="Comment (optional)"
              value={decision.managerComment}
              onChange={(e) => setDecision((prev) => ({ ...prev, managerComment: e.target.value }))}
            />
            <button type="submit">Submit Decision</button>
          </form>
        </article>

        <article className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Timesheet Status History</h2>
          <ul className="simple-list">
            {sheets.map((sheet) => (
              <li key={sheet.id}>
                <div>
                  {sheet.weekStartDate} | {sheet.totalHours}h | {sheet.status}
                  {sheet.managerComment ? ` | Comment: ${sheet.managerComment}` : ''}
                </div>
                <div>
                  History: {sheet.history.map((event) => `${event.status}@${new Date(event.at).toLocaleString()}`).join(' -> ')}
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
