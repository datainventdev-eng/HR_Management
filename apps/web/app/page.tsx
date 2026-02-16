'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, getSession } from './lib.session';

type Overview = {
  greeting: string;
  role: 'employee' | 'manager' | 'hr_admin';
  kpis: {
    totalEmployees: number;
    presentToday: number;
    onLeave: number;
    openPositions: number;
    pendingTimesheets: number;
  };
  attendance: {
    date: string;
    presentCount: number;
    lateCount: number;
    earlyLeaveCount: number;
    partialPresentCount?: number;
  };
  attendanceTrends: {
    month: string;
    previousWorkingDate: string;
    series: {
      headcount: number[];
      present: number[];
      absent: number[];
      late: number[];
      earlyLeave: number[];
      partialPresent?: number[];
      onTime: number[];
    };
    deltaPercent: {
      headcount: number;
      present: number;
      absent: number;
      late: number;
      earlyLeave: number;
      partialPresent?: number;
      onTime: number;
    };
  };
  schedule: Array<{ id: string; title: string; time: string }>;
  quickActions: string[];
  recentActivity: Array<{ id: string; action: string; entity: string; createdAt: string }>;
  projectHours: Array<{ projectId: string; name: string; customerName?: string; hours: number }>;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function HomePage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<'employee' | 'manager' | 'hr_admin'>('hr_admin');
  const [viewerName, setViewerName] = useState('User');
  const [viewerRole, setViewerRole] = useState<'employee' | 'manager' | 'hr_admin'>('hr_admin');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [projectModal, setProjectModal] = useState<{
    projectId: string;
    projectName: string;
    rows: Array<{ employeeId: string; employeeName: string; hours: number }>;
  } | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectScope, setProjectScope] = useState<'month' | 'all'>('month');
  const [projectHoursData, setProjectHoursData] = useState<Array<{ projectId: string; name: string; customerName?: string; hours: number }>>([]);
  const [projectHoursLoading, setProjectHoursLoading] = useState(false);
  const [schedulePage, setSchedulePage] = useState(0);

  async function loadOverview(nextRole = role) {
    try {
      const session = getSession();
      if (!session) return;
      const response = await fetch(`${apiBase}/dashboard/overview`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-role': nextRole,
          'x-employee-id': session.user.employeeId || session.user.id,
        },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Failed to load dashboard.');
      setOverview(payload);
      setMessage('Dashboard synced with live API data.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load dashboard data.');
    }
  }

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setRole(session.user.role);
    setViewerName(session.user.fullName || 'User');
    setViewerRole(session.user.role);
    loadOverview(session.user.role);
  }, []);

  async function loadProjectHours(scope: 'month' | 'all', roleOverride?: 'employee' | 'manager' | 'hr_admin') {
    try {
      const session = getSession();
      if (!session) return;
      setProjectHoursLoading(true);
      const monthParam = new Date().toISOString().slice(0, 7);
      const query = scope === 'month' ? `?month=${monthParam}` : '';
      const response = await fetch(`${apiBase}/dashboard/project-hours${query}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-role': roleOverride || role,
          'x-employee-id': session.user.employeeId || session.user.id,
        },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Failed to load project time summary.');
      setProjectHoursData(payload || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load project time summary.');
    } finally {
      setProjectHoursLoading(false);
    }
  }

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    loadProjectHours(projectScope, session.user.role);
  }, [projectScope]);

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

  function formatRoleLabel(value: 'employee' | 'manager' | 'hr_admin') {
    if (value === 'hr_admin') return 'HR Admin';
    if (value === 'manager') return 'Manager';
    return 'Employee';
  }

  const kpis = useMemo(() => {
    const totalEmployees = overview?.kpis.totalEmployees ?? 0;
    const presentToday = overview?.attendance.presentCount ?? overview?.kpis.presentToday ?? 0;
    const absentToday = Math.max(totalEmployees - presentToday, 0);
    const lateEmployees = overview?.attendance.lateCount ?? 0;
    const partialPresentToday = overview?.attendance.partialPresentCount ?? 0;

    const trends = overview?.attendanceTrends;
    return [
      {
        label: 'Total Employees',
        value: totalEmployees,
        sub: 'company headcount',
        points: trends?.series.headcount || [totalEmployees],
        delta: trends?.deltaPercent.headcount ?? 0,
      },
      {
        label: 'Present Today',
        value: presentToday,
        sub: 'attendance count',
        points: trends?.series.present || [presentToday],
        delta: trends?.deltaPercent.present ?? 0,
      },
      {
        label: 'Absent Today',
        value: absentToday,
        sub: 'not checked in',
        points: trends?.series.absent || [absentToday],
        delta: trends?.deltaPercent.absent ?? 0,
      },
      {
        label: 'Late Employees',
        value: lateEmployees,
        sub: 'late arrivals today',
        points: trends?.series.late || [lateEmployees],
        delta: trends?.deltaPercent.late ?? 0,
      },
      {
        label: 'Partial Present Employees',
        value: partialPresentToday,
        sub: 'worked less than 7 hours',
        points: trends?.series.partialPresent || [partialPresentToday],
        delta: trends?.deltaPercent.partialPresent ?? 0,
      },
    ];
  }, [overview]);

  function sparklinePoints(points: number[]) {
    const safe = points.length ? points : [0];
    const width = 122;
    const height = 58;
    const max = Math.max(...safe, 1);
    const step = safe.length === 1 ? width : width / (safe.length - 1);
    return safe
      .map((value, index) => {
        const x = Number((index * step).toFixed(2));
        const y = Number((height - (value / max) * height).toFixed(2));
        return { x, y };
      })
      .filter((point, index, arr) => !(index > 0 && point.x === arr[index - 1].x && point.y === arr[index - 1].y));
  }

  function smoothLinePath(points: number[]) {
    const pts = sparklinePoints(points);
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = Number((p1.x + (p2.x - p0.x) / 6).toFixed(2));
      const c1y = Number((p1.y + (p2.y - p0.y) / 6).toFixed(2));
      const c2x = Number((p2.x - (p3.x - p1.x) / 6).toFixed(2));
      const c2y = Number((p2.y - (p3.y - p1.y) / 6).toFixed(2));
      path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  }

  function areaPath(points: number[]) {
    const pts = sparklinePoints(points);
    if (pts.length === 0) return '';
    const baseY = 58;
    const line = smoothLinePath(points);
    return `${line} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`;
  }

  function formatDeltaParts(delta: number) {
    const percentage = `${Math.round(Math.abs(delta))}%`;
    if (delta > 0) return { percentage, suffix: 'up from yesterday' };
    if (delta < 0) return { percentage, suffix: 'down from yesterday' };
    return { percentage, suffix: 'same as yesterday' };
  }

  const attendanceSnapshot = useMemo(() => {
    const apiTotal = overview?.kpis.totalEmployees ?? 0;
    const rawPresent = overview?.attendance.presentCount ?? 0;
    const rawLate = overview?.attendance.lateCount ?? 0;
    const rawPartialPresent = overview?.attendance.partialPresentCount ?? 0;
    const total = Math.max(apiTotal, rawPresent);
    const onTime = Math.max(rawPresent - rawLate - rawPartialPresent, 0);
    const absent = Math.max(total - rawPresent, 0);

    return {
      total,
      date: overview?.attendance.date || '-',
      rows: [
        { key: 'on_time', label: 'On Time', value: onTime, tone: 'on-time' },
        { key: 'late', label: 'Late', value: rawLate, tone: 'late' },
        { key: 'early', label: 'Partial Present', value: rawPartialPresent, tone: 'early' },
        { key: 'absent', label: 'Absent', value: absent, tone: 'absent' },
      ],
    };
  }, [overview]);
  const attendanceDonutStyle = useMemo(() => {
    const total = Math.max(attendanceSnapshot.total, 1);
    const mapByTone = new Map(attendanceSnapshot.rows.map((row) => [row.tone, row.value]));
    const onTimePct = (Number(mapByTone.get('on-time') || 0) / total) * 100;
    const latePct = (Number(mapByTone.get('late') || 0) / total) * 100;
    const earlyPct = (Number(mapByTone.get('early') || 0) / total) * 100;
    const absentPct = (Number(mapByTone.get('absent') || 0) / total) * 100;
    const p1 = onTimePct;
    const p2 = p1 + latePct;
    const p3 = p2 + earlyPct;
    return {
      background: `conic-gradient(
        #ff7a12 0% ${p1}%,
        #ff9f45 ${p1}% ${p2}%,
        #ffbc7a ${p2}% ${p3}%,
        #ffd7b2 ${p3}% 100%
      )`,
    };
  }, [attendanceSnapshot]);

  const totalProjectHours = useMemo(
    () => projectHoursData.reduce((sum, item) => sum + item.hours, 0),
    [projectHoursData],
  );
  const maxProjectHours = useMemo(
    () => Math.max(1, ...projectHoursData.map((item) => item.hours)),
    [projectHoursData],
  );
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const currentMonthLabel = useMemo(
    () =>
      new Date(`${currentMonth}-01T00:00:00`).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [currentMonth],
  );
  const scheduleBaseHour = useMemo(() => new Date().getHours(), []);
  const hoursPerPage = 5;
  const scheduleWindowStart = useMemo(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(scheduleBaseHour + schedulePage * hoursPerPage);
    return start;
  }, [scheduleBaseHour, schedulePage]);
  const scheduleWindowEnd = useMemo(() => {
    const end = new Date(scheduleWindowStart);
    end.setHours(end.getHours() + hoursPerPage);
    return end;
  }, [scheduleWindowStart]);
  const visibleHourTicks = useMemo(
    () =>
      Array.from({ length: hoursPerPage }, (_, index) => {
        const date = new Date(scheduleWindowStart);
        date.setHours(date.getHours() + index);
        return date;
      }),
    [scheduleWindowStart],
  );
  const scheduleRangeLabel = useMemo(() => {
    const dateLabel = scheduleWindowStart.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const startHourRaw = scheduleWindowStart.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    const endTick = new Date(scheduleWindowStart);
    endTick.setHours(endTick.getHours() + (hoursPerPage - 1));
    const endHourRaw = endTick.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });

    const [startNum, startMeridiem] = startHourRaw.split(' ');
    const [endNum, endMeridiem] = endHourRaw.split(' ');
    const range =
      startMeridiem === endMeridiem
        ? `${startNum}-${endNum} ${startMeridiem}`
        : `${startNum} ${startMeridiem} - ${endNum} ${endMeridiem}`;

    return `${dateLabel} | ${range}`;
  }, [hoursPerPage, scheduleWindowStart]);
  const scheduleDummyEvents = useMemo(() => {
    const base = new Date();
    base.setMinutes(0, 0, 0);
    return [
      {
        id: 'sch_1',
        title: 'Staff Meeting',
        startAt: new Date(base.getTime() + 1 * 60 * 60 * 1000),
        endAt: new Date(base.getTime() + 2 * 60 * 60 * 1000),
        row: 0,
        tone: 'primary' as const,
      },
      {
        id: 'sch_2',
        title: 'Training Session',
        startAt: new Date(base.getTime() + 2 * 60 * 60 * 1000),
        endAt: new Date(base.getTime() + 4 * 60 * 60 * 1000),
        row: 1,
        tone: 'soft' as const,
      },
      {
        id: 'sch_3',
        title: 'Client Sync',
        startAt: new Date(base.getTime() + 4 * 60 * 60 * 1000),
        endAt: new Date(base.getTime() + 5 * 60 * 60 * 1000),
        row: 2,
        tone: 'muted' as const,
      },
      {
        id: 'sch_4',
        title: 'Interview Review',
        startAt: new Date(base.getTime() + 6 * 60 * 60 * 1000),
        endAt: new Date(base.getTime() + 7 * 60 * 60 * 1000),
        row: 0,
        tone: 'primary' as const,
      },
      {
        id: 'sch_5',
        title: 'Planning Call',
        startAt: new Date(base.getTime() + 8 * 60 * 60 * 1000),
        endAt: new Date(base.getTime() + 10 * 60 * 60 * 1000),
        row: 1,
        tone: 'soft' as const,
      },
    ];
  }, []);
  const scheduleVisibleEvents = useMemo(() => {
    const windowStartMs = scheduleWindowStart.getTime();
    const windowEndMs = scheduleWindowEnd.getTime();
    const totalMinutes = hoursPerPage * 60;
    return scheduleDummyEvents
      .filter((event) => event.endAt.getTime() > windowStartMs && event.startAt.getTime() < windowEndMs)
      .map((event) => {
        const startMs = Math.max(event.startAt.getTime(), windowStartMs);
        const endMs = Math.min(event.endAt.getTime(), windowEndMs);
        const left = ((startMs - windowStartMs) / 60000 / totalMinutes) * 100;
        const width = Math.max(((endMs - startMs) / 60000 / totalMinutes) * 100, 12);
        return {
          ...event,
          left,
          width,
        };
      });
  }, [hoursPerPage, scheduleDummyEvents, scheduleWindowEnd, scheduleWindowStart]);

  async function openProjectHours(projectId: string, projectName: string) {
    try {
      const session = getSession();
      if (!session) return;
      setProjectLoading(true);
      const query = projectScope === 'month' ? `?month=${currentMonth}` : '';
      const response = await fetch(`${apiBase}/dashboard/project-hours/${projectId}/employees${query}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-role': role,
          'x-employee-id': session.user.employeeId || session.user.id,
        },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Failed to load project hours.');
      setProjectModal({
        projectId,
        projectName: payload.projectName || projectName,
        rows: payload.rows || [],
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load project hours.');
    } finally {
      setProjectLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-global-header">
        <img src="/logo-white.svg" alt="HR Management System" className="app-global-logo" />
        <div className="user-menu" ref={menuRef}>
          <button type="button" className="user-menu-trigger" onClick={() => setMenuOpen((current) => !current)}>
            <span className="user-menu-text">
              <strong>{viewerName}</strong>
              <small>{formatRoleLabel(viewerRole)}</small>
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

      <aside className="sidebar">
        <nav>
          <a className="nav-item active" href="/">Dashboard</a>
          <a className="nav-item" href="/core-hr">Core HR</a>
          <a className="nav-item" href="/attendance-time">Attendance & Time</a>
          <a className="nav-item" href="/timesheets">Timesheets</a>
          <a className="nav-item" href="/leave-management">Leave Management</a>
          <a className="nav-item" href="/payroll">Payroll</a>
          <a className="nav-item" href="/recruitment">Recruitment</a>
          <a className="nav-item" href="/analytics">Analytics</a>
          <a className="nav-item" href="/documents">Documents</a>
          {role === 'hr_admin' && <a className="nav-item" href="/admin-users">User Access</a>}
          <a className="nav-item" href="#">Settings</a>
        </nav>
      </aside>

      <main className="content">
        <section className="hero">
          <h1>{overview?.greeting || 'Good Morning'}, {viewerName}</h1>
          <p>{message || 'Loading dashboard data...'}</p>
        </section>

        <section className="kpi-grid">
          {kpis.map((kpi) => (
            <article key={kpi.label} className="card kpi-card">
              <div className="kpi-headline">
                <span className="kpi-title">{kpi.label}</span>
              </div>
              <div className="kpi-main">
                <div>
                  <h2>{kpi.value}</h2>
                  <p>{kpi.sub}</p>
                </div>
                <div className={`kpi-trend ${kpi.delta > 0 ? 'up' : kpi.delta < 0 ? 'down' : 'flat'}`}>
                  <svg viewBox="0 0 122 58" aria-hidden="true">
                    <defs>
                      <linearGradient id={`kpi-area-${kpi.label.replace(/\s+/g, '-').toLowerCase()}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff7a12" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#ff7a12" stopOpacity="0.03" />
                      </linearGradient>
                    </defs>
                    <path
                      className="kpi-area"
                      d={areaPath(kpi.points)}
                      fill={`url(#kpi-area-${kpi.label.replace(/\s+/g, '-').toLowerCase()})`}
                    />
                    <path className="kpi-line" d={smoothLinePath(kpi.points)} />
                  </svg>
                  <span className={`kpi-delta ${kpi.delta > 0 ? 'up' : kpi.delta < 0 ? 'down' : 'flat'}`}>
                    <span className={`kpi-delta-value ${kpi.delta > 0 ? 'up' : kpi.delta < 0 ? 'down' : 'flat'}`}>
                      {formatDeltaParts(kpi.delta).percentage}
                    </span>{' '}
                    <span>{formatDeltaParts(kpi.delta).suffix}</span>
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="main-grid">
          <article className="card attendance-card">
            <h2>Attendance Snapshot</h2>
            <p>
              Date {attendanceSnapshot.date}: team size {attendanceSnapshot.total}
            </p>
            <div className="attendance-snapshot-layout">
              <div className="attendance-donut-col">
                <div className="attendance-donut" style={attendanceDonutStyle}>
                  <div className="attendance-donut-center">
                    <strong>{attendanceSnapshot.total}</strong>
                    <small>Team Members</small>
                  </div>
                </div>
              </div>
              <div className="attendance-bars">
                {attendanceSnapshot.rows.map((row) => (
                  <div key={row.key} className="attendance-bar-row">
                    <div className="attendance-bar-head">
                      <span>{row.label}</span>
                      <span>
                        {Math.round((row.value / Math.max(attendanceSnapshot.total, 1)) * 100)}%
                      </span>
                    </div>
                    <div className="attendance-bar-track">
                      <div
                        className={`attendance-bar-fill ${row.tone}`}
                        style={{ width: `${(row.value / Math.max(attendanceSnapshot.total, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="card schedule-card">
            <div className="schedule-head">
              <div>
                <h2>Events</h2>
              </div>
              <div className="schedule-nav">
                <button
                  type="button"
                  onClick={() => setSchedulePage((prev) => Math.max(0, prev - 1))}
                  disabled={schedulePage === 0}
                  aria-label="Previous hours"
                >
                  <span aria-hidden="true">←</span>
                </button>
                <span className="schedule-range-label">{scheduleRangeLabel}</span>
                <button type="button" onClick={() => setSchedulePage((prev) => prev + 1)} aria-label="Next hours">
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
            <div className="schedule-timeline-scroll">
              <div className="schedule-timeline-inner">
                <div className="schedule-hours-row">
                  {visibleHourTicks.map((tick) => (
                    <span key={tick.toISOString()}>
                      {tick.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).replace(' ', '')}
                    </span>
                  ))}
                </div>
                <div className="schedule-timeline-body">
                  {visibleHourTicks.map((tick) => (
                    <span key={tick.toISOString()} className="schedule-hour-guide" />
                  ))}
                  {scheduleVisibleEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`schedule-event-pill ${event.tone}`}
                      style={{
                        left: `${event.left}%`,
                        width: `${event.width}%`,
                        top: `${18 + event.row * 58}px`,
                      }}
                    >
                      {event.title}
                    </div>
                  ))}
                  {scheduleVisibleEvents.length === 0 && <small className="schedule-empty">No meetings in this hour range.</small>}
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="lower-grid">
          <article className="card projects-card">
            <div className="projects-head">
              <div>
                <h2>Project Time Summary</h2>
                <p>
                  {projectScope === 'month' ? currentMonthLabel : 'All Time'}: {totalProjectHours.toFixed(2)}h total on all projects
                </p>
              </div>
              <label className="projects-filter">
                <span>Range</span>
                <select
                  value={projectScope}
                  onChange={(event) => setProjectScope(event.target.value as 'month' | 'all')}
                >
                  <option value="month">This month</option>
                  <option value="all">All time</option>
                </select>
              </label>
            </div>
            <div className="project-hours-chart-wrap">
              {projectHoursLoading && <small>Loading project hours...</small>}
              {!projectHoursLoading && projectHoursData.length === 0 && (
                <small>No project hours logged yet for {projectScope === 'month' ? currentMonthLabel : 'all time'}.</small>
              )}
              <div className="project-hours-chart">
                {projectHoursData.map((project) => (
                  <button
                    key={project.projectId}
                    type="button"
                    className="project-hours-column"
                    onClick={() => openProjectHours(project.projectId, project.name)}
                    title={`${project.name}: ${project.hours.toFixed(2)} hours`}
                  >
                    <span className="project-hours-value">{project.hours.toFixed(2)}h</span>
                    <span
                      className={`project-hours-bar${project.hours === maxProjectHours ? ' is-peak' : ''}`}
                      style={{ height: `${Math.max(22, (project.hours / maxProjectHours) * 180)}px` }}
                    />
                    <span className="project-hours-name">{project.name}</span>
                  </button>
                ))}
              </div>
            </div>
            {projectLoading && <small>Loading project breakdown...</small>}
          </article>

          <div className="side-stack">
            <article className="card">
              <h2>Quick Actions</h2>
              <div className="quick-actions">
                {(overview?.quickActions || []).map((action) => (
                  <button key={action} type="button" aria-label={action}>{action}</button>
                ))}
              </div>
            </article>

            <article className="card">
              <h2>Recent Activity</h2>
              <ul className="activity-list">
                {(overview?.recentActivity || []).map((item) => (
                  <li key={item.id}>{item.action} on {item.entity}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>
        {projectModal && (
          <div className="modal-backdrop" onClick={() => setProjectModal(null)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <h3>{projectModal.projectName}</h3>
                <button type="button" onClick={() => setProjectModal(null)}>
                  Close
                </button>
              </div>
              <p>Employee-wise hours spent</p>
              <div className="employee-hours-chart">
                {(projectModal.rows || []).length === 0 && <small>No hours logged for this project yet.</small>}
                {(projectModal.rows || []).map((row) => {
                  const maxHours = Math.max(1, ...projectModal.rows.map((item) => item.hours));
                  return (
                    <div key={row.employeeId} className="employee-hours-row">
                      <div className="employee-hours-head">
                        <span>{row.employeeName}</span>
                        <span>{row.hours.toFixed(2)}h</span>
                      </div>
                      <div className="employee-hours-track">
                        <div className="employee-hours-fill" style={{ width: `${(row.hours / maxHours) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
