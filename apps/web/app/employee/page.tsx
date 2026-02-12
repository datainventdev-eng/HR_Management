'use client';

import { useRouter } from 'next/navigation';
import { clearSession, getSession } from '../lib.session';

export default function EmployeeHomePage() {
  const router = useRouter();
  const session = getSession();

  return (
    <main className="employee-home-page">
      <section className="card">
        <h1>Employee Home</h1>
        <p>
          Welcome {session?.user.fullName || 'Employee'}. Use quick actions for attendance, timesheets, leave, and payslips.
        </p>
        <div className="quick-actions" style={{ marginTop: 14 }}>
          <button type="button" onClick={() => router.push('/attendance-time')}>Check In / Out</button>
          <button type="button" onClick={() => router.push('/timesheets')}>Timesheets</button>
          <button type="button" onClick={() => router.push('/leave-management')}>Leave</button>
          <button type="button" onClick={() => router.push('/payroll')}>Payslips</button>
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
