'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, getSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

export default function EmployeeHomePage() {
  const router = useRouter();
  const session = getSession();
  const [message, setMessage] = useState('');
  const [todayRecord, setTodayRecord] = useState<{
    checkInTime?: string;
    checkOutTime?: string;
    isLate: boolean;
    leftEarly: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<'check_in' | 'check_out' | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [now, setNow] = useState(new Date());

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  function formatClock(value: Date) {
    return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function formatDay(value: Date) {
    return value.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function formatTimeFromRecord(value?: string) {
    if (!value) return '--:--';
    const parsed = new Date(`1970-01-01T${value}`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function normalizeDate(value?: string) {
    if (!value) return '';
    return value.slice(0, 10);
  }

  function pickCurrentRecord(records: Array<{
    date?: string;
    checkInTime?: string;
    checkOutTime?: string;
    isLate: boolean;
    leftEarly: boolean;
  }>) {
    const todayUtc = new Date().toISOString().slice(0, 10);
    const todayLocal = new Date().toLocaleDateString('en-CA');

    const exactToday =
      records.find((item) => normalizeDate(item.date) === todayLocal) ||
      records.find((item) => normalizeDate(item.date) === todayUtc);
    if (exactToday) return exactToday;

    // Fallback: latest open record (checked-in but not checked-out), useful for TZ mismatch.
    const latestOpen = records
      .filter((item) => !!item.checkInTime && !item.checkOutTime)
      .sort((a, b) => normalizeDate(b.date).localeCompare(normalizeDate(a.date)))[0];
    if (latestOpen) return latestOpen;

    return null;
  }

  async function refreshTodayRecord() {
    if (!session) return;
    try {
      setRecordLoading(true);
      const month = new Date().toISOString().slice(0, 7);
      const prevMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
      const [currRes, prevRes] = await Promise.all([
        fetch(`${apiBase}/attendance/monthly?month=${month}`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-role': 'employee',
            'x-employee-id': session.user.employeeId || session.user.id,
          },
        }),
        fetch(`${apiBase}/attendance/monthly?month=${prevMonth}`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-role': 'employee',
            'x-employee-id': session.user.employeeId || session.user.id,
          },
        }),
      ]);

      const currPayload = await currRes.json();
      const prevPayload = await prevRes.json();
      if (!currRes.ok) throw new Error(currPayload.message ?? 'Failed to load attendance.');
      if (!prevRes.ok) throw new Error(prevPayload.message ?? 'Failed to load attendance.');

      const merged = [
        ...(Array.isArray(currPayload) ? currPayload : []),
        ...(Array.isArray(prevPayload) ? prevPayload : []),
      ];
      const record = pickCurrentRecord(merged);
      setTodayRecord(record);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load attendance.');
    } finally {
      setRecordLoading(false);
    }
  }

  async function markCheckIn() {
    if (!session) return;
    try {
      setActionLoading('check_in');
      const response = await fetch(`${apiBase}/attendance/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-role': 'employee',
          'x-employee-id': session.user.employeeId || session.user.id,
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) {
        if ((payload.message || '').toLowerCase().includes('already checked in')) {
          await refreshTodayRecord();
        }
        throw new Error(payload.message ?? 'Check-in failed.');
      }
      setMessage(`Checked in at ${payload.checkInTime}.`);
      await refreshTodayRecord();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check-in failed.');
    } finally {
      setActionLoading(null);
    }
  }

  async function markCheckOut() {
    if (!session) return;
    try {
      setActionLoading('check_out');
      const response = await fetch(`${apiBase}/attendance/check-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-role': 'employee',
          'x-employee-id': session.user.employeeId || session.user.id,
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) {
        if ((payload.message || '').toLowerCase().includes('already checked out')) {
          await refreshTodayRecord();
        }
        throw new Error(payload.message ?? 'Check-out failed.');
      }
      setMessage(`Checked out at ${payload.checkOutTime}.`);
      await refreshTodayRecord();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check-out failed.');
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    refreshTodayRecord();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hasCheckedIn = !!todayRecord?.checkInTime;
  const hasCheckedOut = !!todayRecord?.checkOutTime;
  const canCheckIn = !hasCheckedIn && !actionLoading;
  const canCheckOut = hasCheckedIn && !hasCheckedOut && !actionLoading;
  const primaryMode = hasCheckedIn && !hasCheckedOut ? 'day_out' : 'day_in';
  const primaryDisabled = hasCheckedOut || !!actionLoading;

  return (
    <main className="employee-home-page">
      <section className="card employee-attendance-card">
        <h1 className="employee-clock">{formatClock(now)}</h1>
        <p className="employee-day">{formatDay(now)}</p>

        <div className={`attendance-ring ${primaryMode} ${primaryDisabled ? 'disabled' : ''}`}>
          <button
            type="button"
            disabled={primaryDisabled}
            onClick={primaryMode === 'day_in' ? markCheckIn : markCheckOut}
            className="attendance-ring-button"
          >
            <span className="attendance-ring-icon">☝</span>
            <span>{primaryMode === 'day_in' ? 'Day In' : 'Day Out'}</span>
          </button>
        </div>

        {actionLoading && (
          <div className="attendance-progress-wrap">
            <div className="attendance-progress-label">Saving attendance...</div>
            <div className="attendance-progress">
              <div className="attendance-progress-bar" />
            </div>
          </div>
        )}

        <p className="employee-location">Office Workspace</p>

        <div className="attendance-mini-grid">
          <div className="attendance-mini-box">
            <div className="attendance-mini-label">Day In</div>
            <div className="attendance-mini-time">{formatTimeFromRecord(todayRecord?.checkInTime)}</div>
            <button type="button" onClick={markCheckIn} disabled={!canCheckIn}>
              Check In
            </button>
          </div>
          <div className="attendance-mini-box">
            <div className="attendance-mini-label">Day Out</div>
            <div className="attendance-mini-time">{formatTimeFromRecord(todayRecord?.checkOutTime)}</div>
            <button type="button" onClick={markCheckOut} disabled={!canCheckOut}>
              Check Out
            </button>
          </div>
        </div>

        <small className="employee-status-line">
          {recordLoading ? 'Loading today attendance...' : `Status: ${todayRecord ? (todayRecord.isLate ? 'Late' : 'On time') : 'Not checked in'}`}
          {todayRecord?.leftEarly ? ' · Left early' : ''}
        </small>
        <FeedbackMessage message={message} />

        <div className="quick-actions" style={{ marginTop: 14 }}>
          <button type="button" onClick={() => router.push('/timesheets')}>Timesheets</button>
          <button type="button" onClick={() => router.push('/leave-management')}>Leave</button>
          <button type="button" onClick={() => router.push('/payroll')}>Payslips</button>
          <button type="button" onClick={() => router.push('/attendance-time')}>Attendance Details</button>
        </div>

        <div className="row-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => {
              clearSession();
              router.replace('/login');
            }}
          >
            Logout
          </button>
        </div>
      </section>
    </main>
  );
}
