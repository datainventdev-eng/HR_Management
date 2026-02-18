'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [timesheetLoading, setTimesheetLoading] = useState(false);
  const [timesheetMonthTotal, setTimesheetMonthTotal] = useState('00:00');
  const [hasTodayTimesheet, setHasTodayTimesheet] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveSummary, setLeaveSummary] = useState<{
    pending: number;
    approved: number;
    rejected: number;
    lastStatus?: 'Pending' | 'Approved' | 'Rejected';
    lastRange?: string;
  }>({ pending: 0, approved: 0, rejected: 0 });
  const [now, setNow] = useState(new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  async function readPayload(response: Response) {
    const raw = await response.text();
    if (!raw) return {} as any;
    try {
      return JSON.parse(raw) as any;
    } catch {
      return { message: raw } as any;
    }
  }

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
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.message ?? 'Failed to load attendance.');
      setTodayRecord(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load attendance.');
    } finally {
      setRecordLoading(false);
    }
  }

  async function refreshTimesheetStatus() {
    if (!session) return;
    try {
      setTimesheetLoading(true);
      const todayIso = localDateIso();
      const weekStart = startOfWeek(new Date());
      const dayKey = dayKeyFromDate(new Date());

      const [summaryResponse, singleResponse, weeklyResponse] = await Promise.all([
        fetch(`${apiBase}/timesheet/summary?weekStartDate=${weekStart}`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-role': 'employee',
            'x-employee-id': session.user.employeeId || session.user.id,
          },
        }),
        fetch(`${apiBase}/timesheet/single?date=${todayIso}`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-role': 'employee',
            'x-employee-id': session.user.employeeId || session.user.id,
          },
        }),
        fetch(`${apiBase}/timesheet/weekly-rows?weekStartDate=${weekStart}`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-role': 'employee',
            'x-employee-id': session.user.employeeId || session.user.id,
          },
        }),
      ]);

      const summaryPayload = await readPayload(summaryResponse);
      const singlePayload = await readPayload(singleResponse);
      const weeklyPayload = await readPayload(weeklyResponse);

      if (!summaryResponse.ok) {
        throw new Error(summaryPayload.message ?? 'Failed to load timesheet summary.');
      }

      const singleLogged = Array.isArray(singlePayload) && singlePayload.length > 0;
      const weeklyLogged =
        Array.isArray(weeklyPayload?.rows) &&
        weeklyPayload.rows.some((row: any) => Number(row?.hours?.[dayKey] || 0) > 0);

      setTimesheetMonthTotal(summaryPayload.thisMonthTotal || '00:00');
      setHasTodayTimesheet(singleLogged || weeklyLogged);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load timesheet status.');
    } finally {
      setTimesheetLoading(false);
    }
  }

  function formatLeaveRange(startDate: string, endDate: string) {
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const parseDate = (text: string) => {
      const [yearText, monthText, dayText] = text.slice(0, 10).split('-');
      return new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
    };
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    const startLabel = dateFormatter.format(start);
    const endLabel = dateFormatter.format(end);
    return startDate === endDate ? startLabel : `${startLabel} to ${endLabel}`;
  }

  async function refreshLeaveStatus() {
    if (!session) return;
    try {
      setLeaveLoading(true);
      const response = await fetch(`${apiBase}/leave/requests`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-role': 'employee',
          'x-employee-id': session.user.employeeId || session.user.id,
        },
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.message ?? 'Failed to load leave status.');
      const requests = Array.isArray(payload) ? payload : [];
      const pending = requests.filter((item: any) => item.status === 'Pending').length;
      const approved = requests.filter((item: any) => item.status === 'Approved').length;
      const rejected = requests.filter((item: any) => item.status === 'Rejected').length;
      const latest = requests[0];
      setLeaveSummary({
        pending,
        approved,
        rejected,
        lastStatus: latest?.status,
        lastRange: latest ? formatLeaveRange(latest.startDate, latest.endDate) : undefined,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load leave status.');
    } finally {
      setLeaveLoading(false);
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
      const payload = await readPayload(response);
      if (!response.ok) {
        if ((payload.message || '').toLowerCase().includes('already checked in')) {
          await refreshTodayRecord();
        }
        throw new Error(payload.message ?? 'Check-in failed.');
      }
      setMessage(`Checked in at ${payload.checkInTime}.`);
      await refreshTodayRecord();
      await refreshTimesheetStatus();
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
      const payload = await readPayload(response);
      if (!response.ok) {
        if ((payload.message || '').toLowerCase().includes('already checked out')) {
          await refreshTodayRecord();
        }
        throw new Error(payload.message ?? 'Check-out failed.');
      }
      setMessage(`Checked out at ${payload.checkOutTime}.`);
      await refreshTodayRecord();
      await refreshTimesheetStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check-out failed.');
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    refreshTodayRecord();
    refreshTimesheetStatus();
    refreshLeaveStatus();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const hasCheckedIn = !!todayRecord?.checkInTime;
  const hasCheckedOut = !!todayRecord?.checkOutTime;
  const primaryMode = hasCheckedIn && !hasCheckedOut ? 'day_out' : 'day_in';
  const primaryDisabled = hasCheckedOut || !!actionLoading;
  const viewerName = session?.user.fullName || 'Employee';
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedYear, selectedMonth] = selectedMonthKey.split('-').map(Number);
  const nowMonthDate = new Date(selectedYear, (selectedMonth || 1) - 1, 1);
  const monthLabel = nowMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(nowMonthDate.getFullYear(), nowMonthDate.getMonth(), 1);
  const daysInMonth = new Date(nowMonthDate.getFullYear(), nowMonthDate.getMonth() + 1, 0).getDate();
  const firstWeekday = firstDay.getDay();

  type DayStatus = 'full' | 'partial' | 'late' | 'absent';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStatuses: Array<{
    day: number;
    status?: DayStatus;
    hours: number;
    isWeekend: boolean;
    isFuture: boolean;
    isInactive: boolean;
  }> = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(nowMonthDate.getFullYear(), nowMonthDate.getMonth(), day);
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const isFuture = date.getTime() > today.getTime();
    const isInactive = isWeekend || isFuture;

    if (isInactive) {
      return { day, hours: 0, isWeekend, isFuture, isInactive };
    }

    if (day % 9 === 0) return { day, status: 'absent', hours: 0, isWeekend, isFuture, isInactive };
    if (day % 7 === 0) return { day, status: 'partial', hours: 5.5, isWeekend, isFuture, isInactive };
    if (day % 5 === 0) return { day, status: 'late', hours: 8.1, isWeekend, isFuture, isInactive };
    return { day, status: 'full', hours: 8.7, isWeekend, isFuture, isInactive };
  });
  const statusCounts = monthStatuses.reduce(
    (acc, item) => {
      if (!item.status) return acc;
      acc[item.status] += 1;
      return acc;
    },
    { full: 0, partial: 0, late: 0, absent: 0 },
  );
  const activeDay =
    monthStatuses.find((item) => item.day === selectedDay && item.status) ||
    monthStatuses.find((item) => item.status) ||
    monthStatuses[0];
  const statusLabel = {
    full: 'Fully Present',
    partial: 'Partial Present',
    late: 'Late',
    absent: 'Absent',
  } as const;
  const monthOptions = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(2026, index, 1);
    return {
      key: `${date.getFullYear()}-${String(index + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  });

  return (
    <div className="employee-dashboard-shell">
      <header className="app-global-header employee-global-header">
        <img src="/logo-white.svg" alt="HR Management System" className="app-global-logo" />
        <div className="user-menu" ref={menuRef}>
          <button type="button" className="user-menu-trigger" onClick={() => setMenuOpen((current) => !current)}>
            <span className="user-menu-text">
              <strong>{viewerName}</strong>
              <small>Employee</small>
            </span>
            <span className="user-menu-chevron" aria-hidden="true">▾</span>
          </button>
          {menuOpen && (
            <div className="user-menu-dropdown">
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
          )}
        </div>
      </header>

      <main className="employee-dashboard-main">
        <section className="card employee-attendance-card employee-left-panel">
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
        </section>

        <aside className="employee-insights-column">
          <article className="card employee-graph-card employee-status-card">
            <div className="employee-status-head">
              <div>
                <h3>Attendance Calendar</h3>
                <p>{monthLabel}</p>
              </div>
              <select
                className="employee-month-select"
                value={selectedMonthKey}
                onChange={(event) => setSelectedMonthKey(event.target.value)}
              >
                {monthOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="employee-status-chips">
              <span className="full">Fully Present: {statusCounts.full}</span>
              <span className="partial">Partial: {statusCounts.partial}</span>
              <span className="late">Late: {statusCounts.late}</span>
              <span className="absent">Absent: {statusCounts.absent}</span>
            </div>
            <div className="employee-status-calendar">
              {Array.from({ length: firstWeekday }).map((_, index) => (
                <span key={`spacer-${index}`} className="calendar-spacer" />
              ))}
              {monthStatuses.map((entry) => (
                <button
                  key={entry.day}
                  type="button"
                  className={`calendar-day ${entry.status || ''} ${entry.isInactive ? 'inactive' : ''} ${activeDay?.day === entry.day ? 'active' : ''}`}
                  onClick={() => {
                    if (entry.isInactive) return;
                    setSelectedDay(entry.day);
                  }}
                  title={
                    entry.isFuture
                      ? `Day ${entry.day}: Future`
                      : entry.isWeekend
                      ? `Day ${entry.day}: Weekend`
                      : `Day ${entry.day}: ${statusLabel[entry.status as DayStatus]}`
                  }
                >
                  {entry.day}
                </button>
              ))}
            </div>
            <div className="employee-status-legend">
              <span><i className="dot full" /> Fully Present</span>
              <span><i className="dot partial" /> Partial</span>
              <span><i className="dot late" /> Late</span>
              <span><i className="dot absent" /> Absent</span>
            </div>
            <div className="employee-day-detail">
              <strong>
                Day {activeDay.day}:{' '}
                {activeDay.status ? statusLabel[activeDay.status] : activeDay.isFuture ? 'Future' : 'Weekend'}
              </strong>
              <small>
                {!activeDay.status
                  ? 'No status for this day.'
                  : activeDay.status === 'absent'
                  ? 'No attendance logged.'
                  : `${activeDay.hours} working hours (dummy)`}
              </small>
            </div>
          </article>

          <article className={`card employee-timesheet-card ${hasCheckedIn && !hasTodayTimesheet ? 'needs-log' : ''}`}>
            <h3>Timesheets</h3>
            <p>total hours logged in this month</p>
            <strong className="employee-timesheet-total">{timesheetMonthTotal}</strong>
            <small className="employee-timesheet-note">
              {timesheetLoading
                ? 'Checking today timesheet...'
                : hasCheckedIn && !hasTodayTimesheet
                ? 'Reminder: You checked in today but have not logged timesheet yet.'
                : 'Timesheet is up to date for today.'}
            </small>
            <button type="button" onClick={() => router.push('/timesheets')}>
              Open Timesheets
            </button>
          </article>

          <article className="card employee-leave-card">
            <h3>Leave Status</h3>
            <p>Your leave request summary</p>
            <div className="employee-leave-stats">
              <span className="pending">Pending: {leaveSummary.pending}</span>
              <span className="approved">Approved: {leaveSummary.approved}</span>
              <span className="rejected">Rejected: {leaveSummary.rejected}</span>
            </div>
            <small className="employee-leave-last">
              {leaveLoading
                ? 'Loading leave status...'
                : leaveSummary.lastStatus
                ? `Last request: ${leaveSummary.lastStatus} (${leaveSummary.lastRange})`
                : 'No leave requests yet.'}
            </small>
            <button type="button" onClick={() => router.push('/leave-management')}>
              Open Leave
            </button>
          </article>
        </aside>
      </main>
    </div>
  );
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function dayKeyFromDate(date: Date): 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' {
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  return keys[date.getDay()];
}
