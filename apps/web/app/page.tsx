'use client';

import { useEffect, useMemo, useState } from 'react';
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
  };
  schedule: Array<{ id: string; title: string; time: string }>;
  quickActions: string[];
  recentActivity: Array<{ id: string; action: string; entity: string; createdAt: string }>;
  currentProjects: Array<{ name: string; progress: number; due: string }>;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function HomePage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<'employee' | 'manager' | 'hr_admin'>('hr_admin');

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
    loadOverview(session.user.role);
  }, []);

  const kpis = useMemo(
    () => [
      { label: 'Total Employees', value: overview?.kpis.totalEmployees ?? 0, sub: 'company headcount' },
      { label: 'Present Today', value: overview?.kpis.presentToday ?? 0, sub: 'attendance count' },
      { label: 'On Leave', value: overview?.kpis.onLeave ?? 0, sub: 'approved today' },
      { label: 'Open Positions', value: overview?.kpis.openPositions ?? 0, sub: 'active postings' },
      { label: 'Pending Timesheets', value: overview?.kpis.pendingTimesheets ?? 0, sub: 'awaiting manager review' },
    ],
    [overview],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">HR Manager</div>
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
          <a
            className="nav-item"
            href="/login"
            onClick={(event) => {
              event.preventDefault();
              clearSession();
              router.replace('/login');
            }}
          >
            Logout
          </a>
        </nav>
      </aside>

      <main className="content">
        <header className="topbar card">
          <input aria-label="Search" placeholder="Search employees, documents, or reports..." />
          <div className="topbar-meta">
            <span>Role: {role}</span>
          </div>
        </header>

        <section className="hero">
          <h1>{overview?.greeting || 'Good Morning'}, John</h1>
          <p>{message || 'Loading dashboard data...'}</p>
        </section>

        <section className="kpi-grid">
          {kpis.map((kpi) => (
            <article key={kpi.label} className="card kpi-card">
              <h2>{kpi.value}</h2>
              <h3>{kpi.label}</h3>
              <p>{kpi.sub}</p>
            </article>
          ))}
        </section>

        <section className="main-grid">
          <article className="card attendance-card">
            <h2>Attendance Snapshot</h2>
            <p>
              Date {overview?.attendance.date || '-'}: present {overview?.attendance.presentCount || 0}, late{' '}
              {overview?.attendance.lateCount || 0}, early leave {overview?.attendance.earlyLeaveCount || 0}
            </p>
            <div className="chart-placeholder">Live chart integration placeholder</div>
          </article>

          <article className="card schedule-card">
            <h2>Schedule</h2>
            <p>Your meetings and team time-offs</p>
            <ul>
              {(overview?.schedule || []).map((item) => (
                <li key={item.id}>{item.time} - {item.title}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className="lower-grid">
          <article className="card projects-card">
            <h2>Current Projects</h2>
            <p>Active HR initiatives and progress</p>
            <ul className="project-list">
              {(overview?.currentProjects || []).map((project) => (
                <li key={project.name}>
                  <div className="project-row"><span>{project.name}</span><span>{project.progress}%</span></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${project.progress}%` }} /></div>
                  <small>Due: {project.due}</small>
                </li>
              ))}
            </ul>
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
      </main>
    </div>
  );
}
