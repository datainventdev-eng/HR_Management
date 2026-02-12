const kpis = [
  { label: 'Total Employees', value: '524', sub: 'vs last month', badge: '+12' },
  { label: 'Present Today', value: '487', sub: 'attendance rate', badge: '93%' },
  { label: 'On Leave', value: '37', sub: 'sick leaves', badge: '15' },
  { label: 'Open Positions', value: '12', sub: 'new this week', badge: '+5' },
];

const quickActions = ['Add Employee', 'Process Payroll', 'Schedule Interview', 'Generate Report'];

const activities = [
  'New employee added',
  'Leave approved',
  'Interview scheduled',
  'Payroll processed',
];

const projects = [
  { name: 'Q1 Performance Reviews', progress: 85, due: 'Mar 15, 2026' },
  { name: 'New Hire Onboarding', progress: 60, due: 'Feb 28, 2026' },
  { name: 'Benefits Enrollment', progress: 40, due: 'Mar 31, 2026' },
  { name: 'Training Program Rollout', progress: 92, due: 'Feb 20, 2026' },
];

export default function HomePage() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">HR Manager</div>
        <nav>
          <a className="nav-item active" href="/">
            Dashboard
          </a>
          <a className="nav-item" href="/core-hr">
            Core HR
          </a>
          <a className="nav-item" href="/attendance-time">
            Attendance & Time
          </a>
          <a className="nav-item" href="/timesheets">
            Timesheets
          </a>
          <a className="nav-item" href="/leave-management">
            Leave Management
          </a>
          <a className="nav-item" href="/payroll">
            Payroll
          </a>
          <a className="nav-item" href="/recruitment">
            Recruitment
          </a>
          <a className="nav-item" href="#">
            Analytics
          </a>
          <a className="nav-item" href="/documents">
            Documents
          </a>
          <a className="nav-item" href="#">
            Settings
          </a>
        </nav>
      </aside>

      <main className="content">
        <header className="topbar card">
          <input aria-label="Search" placeholder="Search employees, documents, or reports..." />
          <div className="topbar-meta">Notifications | JD</div>
        </header>

        <section className="hero">
          <h1>Good Morning, John</h1>
          <p>Here is what is happening with your team today.</p>
        </section>

        <section className="kpi-grid">
          {kpis.map((kpi) => (
            <article key={kpi.label} className="card kpi-card">
              <div className="badge">{kpi.badge}</div>
              <h2>{kpi.value}</h2>
              <h3>{kpi.label}</h3>
              <p>{kpi.sub}</p>
            </article>
          ))}
        </section>

        <section className="main-grid">
          <article className="card attendance-card">
            <h2>Attendance Rate</h2>
            <p>Total attendance rate of employees in this company</p>
            <div className="chart-placeholder">Chart placeholder (monthly attendance bars)</div>
          </article>

          <article className="card schedule-card">
            <h2>Schedule</h2>
            <p>Your meetings and team time-offs</p>
            <ul>
              <li>09:00 AM - Team Standup</li>
              <li>02:30 PM - Interview with Sarah Chen</li>
            </ul>
          </article>
        </section>

        <section className="lower-grid">
          <article className="card projects-card">
            <h2>Current Projects</h2>
            <p>Active HR initiatives and their progress</p>
            <ul className="project-list">
              {projects.map((project) => (
                <li key={project.name}>
                  <div className="project-row">
                    <span>{project.name}</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${project.progress}%` }} />
                  </div>
                  <small>Due: {project.due}</small>
                </li>
              ))}
            </ul>
          </article>

          <div className="side-stack">
            <article className="card">
              <h2>Quick Actions</h2>
              <div className="quick-actions">
                {quickActions.map((action) => (
                  <button key={action} type="button">
                    {action}
                  </button>
                ))}
              </div>
            </article>

            <article className="card">
              <h2>Recent Activity</h2>
              <ul className="activity-list">
                {activities.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
