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

  function localDateIso(date = new Date()) {
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
  }

  function localTimeHm(date = new Date()) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  async function refreshTodayRecord() {
    if (!session) return;
    try {
      setRecordLoading(true);
      const response = await fetch(`${apiBase}/attendance/today?date=${localDateIso()}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-role': 'employee',
          'x-employee-id': session.user.employeeId || session.user.id,
        },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Failed to load attendance.');
      setTodayRecord(payload);
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
        body: JSON.stringify({ date: localDateIso(), time: localTimeHm() }),
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
        body: JSON.stringify({ date: localDateIso(), time: localTimeHm() }),
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
          </div>
          <div className="attendance-mini-box">
            <div className="attendance-mini-label">Day Out</div>
            <div className="attendance-mini-time">{formatTimeFromRecord(todayRecord?.checkOutTime)}</div>
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
