'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FeedbackMessage } from '../components/ui-feedback';
import { getSession } from '../lib.session';

type CatalogCustomer = { id: string; name: string };
type CatalogProject = { id: string; customerId: string; name: string };

type Summary = {
  weekStartDate: string;
  weekEndDate: string;
  thisWeekTotal: string;
  thisMonthTotal: string;
  monthLabel: string;
};

type WeeklyRow = {
  id: string;
  customerId: string;
  projectId: string;
  billable: boolean;
  notes: string;
  hours: { sun: number; mon: number; tue: number; wed: number; thu: number; fri: number; sat: number };
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const DAYS: Array<keyof WeeklyRow['hours']> = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default function TimesheetsPage() {
  const router = useRouter();
  const session = getSession();
  const role = session?.user.role ?? 'employee';
  const employeeId = session?.user.employeeId || session?.user.id || '';

  const [view, setView] = useState<'home' | 'single' | 'weekly'>('home');
  const [message, setMessage] = useState('');

  const [customers, setCustomers] = useState<CatalogCustomer[]>([]);
  const [projects, setProjects] = useState<CatalogProject[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [singleForm, setSingleForm] = useState({
    customerId: '',
    projectId: '',
    billable: true,
    startDate: new Date().toISOString().slice(0, 10),
    duration: '',
    notes: '',
  });

  const [weekStartDate, setWeekStartDate] = useState(startOfWeek(new Date()));
  const [weeklyRows, setWeeklyRows] = useState<WeeklyRow[]>([emptyWeeklyRow()]);
  const [weeklyTotals, setWeeklyTotals] = useState<{ sun: number; mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; total: number }>(
    { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, total: 0 },
  );

  async function callApi(path: string, init?: RequestInit) {
    if (!session?.accessToken) {
      throw new Error('Session not found. Please login again.');
    }
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
        'x-role': role,
        'x-employee-id': employeeId,
        ...(init?.headers || {}),
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? 'Request failed.');
    return payload;
  }

  async function refreshBase() {
    try {
      const [catalogPayload, summaryPayload] = await Promise.all([
        callApi('/timesheet/catalog'),
        callApi(`/timesheet/summary?weekStartDate=${weekStartDate}`),
      ]);
      setCustomers(catalogPayload.customers || []);
      setProjects(catalogPayload.projects || []);
      setSummary(summaryPayload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load timesheet data.');
    }
  }

  async function loadWeeklyRows(date = weekStartDate) {
    try {
      const payload = await callApi(`/timesheet/weekly-rows?weekStartDate=${date}`);
      setWeeklyRows((payload.rows?.length ? payload.rows : [emptyWeeklyRow()]) as WeeklyRow[]);
      setWeeklyTotals(payload.totals || { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, total: 0 });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load weekly rows.');
    }
  }

  function filteredProjects(customerId: string) {
    return projects.filter((project) => project.customerId === customerId);
  }

  function updateWeeklyRow(index: number, patch: Partial<WeeklyRow>) {
    setWeeklyRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateWeeklyHours(index: number, day: keyof WeeklyRow['hours'], value: number) {
    const safe = Number.isNaN(value) ? 0 : value;
    setWeeklyRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, hours: { ...row.hours, [day]: safe } } : row)),
    );
  }

  function addWeeklyRow() {
    setWeeklyRows((prev) => [...prev, emptyWeeklyRow()]);
  }

  function removeWeeklyRow(index: number) {
    setWeeklyRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function saveSingleEntry(event: FormEvent) {
    event.preventDefault();
    try {
      const normalizedDuration = normalizeDuration(singleForm.duration);
      if (!normalizedDuration) {
        setMessage('Duration format is invalid. Use 4, 4.5, or 4:20.');
        return;
      }
      await callApi('/timesheet/single', {
        method: 'POST',
        body: JSON.stringify({ ...singleForm, duration: normalizedDuration }),
      });
      setMessage('Single day activity saved.');
      setSingleForm((prev) => ({ ...prev, duration: '', notes: '' }));
      await refreshBase();
      setView('home');
      router.replace('/timesheets');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save single entry.');
    }
  }

  async function saveWeeklyRows(event: FormEvent) {
    event.preventDefault();
    try {
      const payload = await callApi('/timesheet/weekly-rows', {
        method: 'POST',
        body: JSON.stringify({ weekStartDate, rows: weeklyRows }),
      });
      setWeeklyRows((payload.rows?.length ? payload.rows : [emptyWeeklyRow()]) as WeeklyRow[]);
      setWeeklyTotals(payload.totals || { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, total: 0 });
      setMessage('Weekly timesheet saved.');
      await refreshBase();
      setView('home');
      router.replace('/timesheets');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save weekly timesheet.');
    }
  }

  const weekRangeLabel = useMemo(() => {
    const end = shiftDate(weekStartDate, 6);
    return `${formatDateShort(weekStartDate)} - ${formatDateShort(end)}`;
  }, [weekStartDate]);

  useEffect(() => {
    refreshBase();
  }, [weekStartDate]);

  useEffect(() => {
    if (view === 'weekly') {
      loadWeeklyRows();
    }
  }, [view, weekStartDate]);

  return (
    <main className="timesheet-page">
      <header className="card">
        <h1>Timesheets</h1>
        <p>{session?.user.fullName ? `Hi, ${session.user.fullName}` : 'Track your time entries'}</p>
        <FeedbackMessage message={message} />
      </header>

      {view === 'home' && (
        <section className="card timesheet-home-card">
          <div className="timesheet-total-band">
            <h2>Total time reported</h2>
            <div className="timesheet-total-grid">
              <div>
                <strong>{summary?.thisWeekTotal || '00:00'}</strong>
                <small>THIS WEEK: {weekRangeLabel}</small>
              </div>
              <div>
                <strong>{summary?.thisMonthTotal || '00:00'}</strong>
                <small>THIS MONTH: {summary?.monthLabel || '-'}</small>
              </div>
            </div>
          </div>

          <div className="timesheet-option">
            <div>
              <h3>Weekly timesheet</h3>
              <p>Enter your hours for the week</p>
            </div>
            <button type="button" onClick={() => setView('weekly')}>
              Weekly
            </button>
          </div>

          <div className="timesheet-option">
            <div>
              <h3>Time activity</h3>
              <p>Enter your hours for a single day</p>
            </div>
            <button type="button" onClick={() => setView('single')}>
              Single activity
            </button>
          </div>
        </section>
      )}

      {view === 'single' && (
        <section className="card">
          <div className="timesheet-topline">
            <h2>Single day entry</h2>
            <button type="button" onClick={() => setView('home')}>
              Back
            </button>
          </div>

          <form onSubmit={saveSingleEntry} className="timesheet-single-grid">
            <label>
              Customer
              <select
                value={singleForm.customerId}
                onChange={(event) =>
                  setSingleForm((prev) => ({ ...prev, customerId: event.target.value, projectId: '' }))
                }
                required
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Service
              <select
                value={singleForm.projectId}
                onChange={(event) => setSingleForm((prev) => ({ ...prev, projectId: event.target.value }))}
                required
              >
                <option value="">Select service</option>
                {filteredProjects(singleForm.customerId).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={singleForm.billable}
                onChange={(event) => setSingleForm((prev) => ({ ...prev, billable: event.target.checked }))}
              />
              Billable (per hour)
            </label>

            <label>
              Start date
              <input
                type="date"
                value={singleForm.startDate}
                onChange={(event) => setSingleForm((prev) => ({ ...prev, startDate: event.target.value }))}
                required
              />
            </label>

            <label>
              Duration (hh:mm)
              <input
                value={singleForm.duration}
                onChange={(event) => setSingleForm((prev) => ({ ...prev, duration: event.target.value }))}
                placeholder="4, 4.5, 4:20"
                required
              />
            </label>

            <label className="timesheet-notes-row">
              Notes
              <textarea
                rows={7}
                value={singleForm.notes}
                onChange={(event) => setSingleForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Work notes"
              />
            </label>

            <div className="timesheet-actions-row">
              <button type="button" onClick={() => setView('home')}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </section>
      )}

      {view === 'weekly' && (
        <section className="card">
          <div className="timesheet-topline">
            <h2>Weekly timesheet</h2>
            <div className="row-actions">
              <input type="date" value={weekStartDate} onChange={(event) => setWeekStartDate(event.target.value)} />
              <button type="button" onClick={() => setView('home')}>
                Back
              </button>
            </div>
          </div>

          <form onSubmit={saveWeeklyRows} className="timesheet-weekly-form">
            <div className="timesheet-weekly-head">
              <div>Customers</div>
              <div>Service</div>
              {DAYS.map((day) => (
                <div key={day}>{day.toUpperCase()}</div>
              ))}
              <div>Total</div>
              <div />
            </div>

            {weeklyRows.map((row, rowIndex) => {
              const rowTotal = DAYS.reduce((sum, day) => sum + row.hours[day], 0);
              return (
                <div className="timesheet-weekly-row" key={row.id}>
                  <select
                    value={row.customerId}
                    onChange={(event) => updateWeeklyRow(rowIndex, { customerId: event.target.value, projectId: '' })}
                    required
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={row.projectId}
                    onChange={(event) => updateWeeklyRow(rowIndex, { projectId: event.target.value })}
                    required
                  >
                    <option value="">Select service</option>
                    {filteredProjects(row.customerId).map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>

                  {DAYS.map((day) => (
                    <input
                      key={day}
                      type="number"
                      min={0}
                      max={24}
                      step={0.25}
                      value={row.hours[day]}
                      onChange={(event) => updateWeeklyHours(rowIndex, day, Number(event.target.value))}
                    />
                  ))}

                  <div className="timesheet-row-total">{rowTotal.toFixed(2)}</div>
                  <button type="button" onClick={() => removeWeeklyRow(rowIndex)}>
                    Remove
                  </button>

                  <label className="checkbox-row timesheet-billable">
                    <input
                      type="checkbox"
                      checked={row.billable}
                      onChange={(event) => updateWeeklyRow(rowIndex, { billable: event.target.checked })}
                    />
                    Billable
                  </label>

                  <textarea
                    rows={2}
                    value={row.notes}
                    onChange={(event) => updateWeeklyRow(rowIndex, { notes: event.target.value })}
                    placeholder="Notes"
                    className="timesheet-row-notes"
                  />
                </div>
              );
            })}

            <div className="timesheet-weekly-totals">
              <span>Totals</span>
              <span>{weeklyTotals.sun.toFixed(2)}</span>
              <span>{weeklyTotals.mon.toFixed(2)}</span>
              <span>{weeklyTotals.tue.toFixed(2)}</span>
              <span>{weeklyTotals.wed.toFixed(2)}</span>
              <span>{weeklyTotals.thu.toFixed(2)}</span>
              <span>{weeklyTotals.fri.toFixed(2)}</span>
              <span>{weeklyTotals.sat.toFixed(2)}</span>
              <strong>{weeklyTotals.total.toFixed(2)}</strong>
            </div>

            <div className="timesheet-actions-row">
              <button type="button" onClick={addWeeklyRow}>
                Add Row
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

function emptyWeeklyRow(): WeeklyRow {
  return {
    id: `row_${Math.random().toString(36).slice(2, 9)}`,
    customerId: '',
    projectId: '',
    billable: true,
    notes: '',
    hours: { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 },
  };
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function shiftDate(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateShort(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  return d.toLocaleDateString('en-GB');
}

function normalizeDuration(input: string) {
  const value = input.trim();
  if (!value) return null;

  if (value.includes(':')) {
    const parts = value.split(':');
    if (parts.length !== 2) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric <= 0) return null;
  const hours = Math.floor(numeric);
  const minutes = Math.round((numeric - hours) * 60);
  if (minutes === 60) {
    return `${String(hours + 1).padStart(2, '0')}:00`;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
