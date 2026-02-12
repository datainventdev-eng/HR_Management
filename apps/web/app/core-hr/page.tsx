'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getSession } from '../lib.session';

type Department = { id: string; name: string; code?: string };
type Employee = {
  id: string;
  fullName: string;
  employeeId: string;
  joinDate: string;
  departmentId: string;
  title: string;
  managerId?: string;
  status: 'active' | 'inactive';
};

type LifecycleEvent = {
  id: string;
  employeeId: string;
  type: 'transfer' | 'promotion' | 'resignation' | 'termination';
  effectiveDate: string;
  notes?: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function CoreHrPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [lifecycleEvents, setLifecycleEvents] = useState<LifecycleEvent[]>([]);
  const [activeEmployeeId, setActiveEmployeeId] = useState('');
  const [message, setMessage] = useState('');

  const [departmentForm, setDepartmentForm] = useState({ name: '', code: '' });
  const [employeeForm, setEmployeeForm] = useState({
    fullName: '',
    employeeId: '',
    joinDate: '',
    departmentId: '',
    title: '',
    managerId: '',
    status: 'active' as 'active' | 'inactive',
    email: '',
  });

  const [lifecycleForm, setLifecycleForm] = useState({
    employeeId: '',
    type: 'promotion' as LifecycleEvent['type'],
    effectiveDate: '',
    notes: '',
  });

  const managerOptions = useMemo(() => employees.map((employee) => ({ id: employee.id, label: employee.fullName })), [employees]);

  async function callApi(path: string, init?: RequestInit) {
    const session = getSession();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        'x-role': 'hr_admin',
        ...(init?.headers || {}),
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message ?? 'Request failed.');
    }

    return payload;
  }

  async function refresh() {
    try {
      const [departmentData, employeeData] = await Promise.all([callApi('/core-hr/departments'), callApi('/core-hr/employees')]);
      setDepartments(departmentData);
      setEmployees(employeeData);
      setMessage('Core HR data refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load data.');
    }
  }

  async function seedDemo() {
    try {
      const result = await callApi('/core-hr/seed-demo', { method: 'POST' });
      setMessage(result.message);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to seed demo data.');
    }
  }

  async function createDepartment(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/core-hr/departments', {
        method: 'POST',
        body: JSON.stringify(departmentForm),
      });
      setDepartmentForm({ name: '', code: '' });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create department.');
    }
  }

  async function createEmployee(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/core-hr/employees', {
        method: 'POST',
        body: JSON.stringify({
          ...employeeForm,
          managerId: employeeForm.managerId || undefined,
        }),
      });
      setEmployeeForm({
        fullName: '',
        employeeId: '',
        joinDate: '',
        departmentId: '',
        title: '',
        managerId: '',
        status: 'active',
        email: '',
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create employee.');
    }
  }

  async function addLifecycleEvent(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/core-hr/lifecycle-events', {
        method: 'POST',
        body: JSON.stringify(lifecycleForm),
      });

      if (activeEmployeeId) {
        await loadLifecycleHistory(activeEmployeeId);
      }

      setLifecycleForm({
        employeeId: '',
        type: 'promotion',
        effectiveDate: '',
        notes: '',
      });
      setMessage('Lifecycle event added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add lifecycle event.');
    }
  }

  async function loadLifecycleHistory(employeeId: string) {
    setActiveEmployeeId(employeeId);
    try {
      const history = await callApi(`/core-hr/employees/${employeeId}/lifecycle-events`);
      setLifecycleEvents(history);
      setMessage(`Loaded lifecycle history for employee ${employeeId}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load lifecycle history.');
    }
  }

  async function viewReports(managerId: string) {
    try {
      const reports = await callApi(`/core-hr/managers/${managerId}/reports`);
      setMessage(`Manager has ${reports.length} direct report(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load direct reports.');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="core-hr-page">
      <header className="card">
        <h1>Core HR</h1>
        <p>V1 simple workflows for departments, employee profiles, and lifecycle history.</p>
        <div className="core-hr-actions">
          <button type="button" onClick={seedDemo}>
            Seed Demo Data
          </button>
          <button type="button" onClick={refresh}>
            Refresh Data
          </button>
        </div>
        <small>{message}</small>
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Create Department</h2>
          <form onSubmit={createDepartment} className="form-grid">
            <input
              placeholder="Department name"
              value={departmentForm.name}
              onChange={(event) => setDepartmentForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <input
              placeholder="Code (optional)"
              value={departmentForm.code}
              onChange={(event) => setDepartmentForm((prev) => ({ ...prev, code: event.target.value }))}
            />
            <button type="submit">Save Department</button>
          </form>
          <ul className="simple-list">
            {departments.map((department) => (
              <li key={department.id}>
                {department.name} {department.code ? `(${department.code})` : ''}
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Create Employee Profile</h2>
          <form onSubmit={createEmployee} className="form-grid">
            <input
              placeholder="Full name"
              value={employeeForm.fullName}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, fullName: event.target.value }))}
              required
            />
            <input
              placeholder="Employee ID"
              value={employeeForm.employeeId}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, employeeId: event.target.value }))}
              required
            />
            <input
              type="date"
              value={employeeForm.joinDate}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, joinDate: event.target.value }))}
              required
            />
            <select
              value={employeeForm.departmentId}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, departmentId: event.target.value }))}
              required
            >
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Role/Title"
              value={employeeForm.title}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
            <select
              value={employeeForm.managerId}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, managerId: event.target.value }))}
            >
              <option value="">No manager</option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.label}
                </option>
              ))}
            </select>
            <select
              value={employeeForm.status}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, status: event.target.value as 'active' | 'inactive' }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <input
              placeholder="Email (optional)"
              value={employeeForm.email}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <button type="submit">Save Employee</button>
          </form>
        </article>

        <article className="card">
          <h2>Employee List and Manager View</h2>
          <ul className="simple-list">
            {employees.map((employee) => (
              <li key={employee.id}>
                <div>
                  <strong>{employee.fullName}</strong> ({employee.employeeId}) - {employee.title}
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => loadLifecycleHistory(employee.id)}>
                    Lifecycle
                  </button>
                  <button type="button" onClick={() => viewReports(employee.id)}>
                    Direct Reports
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Add Lifecycle Event</h2>
          <form onSubmit={addLifecycleEvent} className="form-grid">
            <select
              value={lifecycleForm.employeeId}
              onChange={(event) => setLifecycleForm((prev) => ({ ...prev, employeeId: event.target.value }))}
              required
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
            <select
              value={lifecycleForm.type}
              onChange={(event) =>
                setLifecycleForm((prev) => ({
                  ...prev,
                  type: event.target.value as LifecycleEvent['type'],
                }))
              }
            >
              <option value="promotion">Promotion</option>
              <option value="transfer">Transfer</option>
              <option value="resignation">Resignation</option>
              <option value="termination">Termination</option>
            </select>
            <input
              type="date"
              value={lifecycleForm.effectiveDate}
              onChange={(event) => setLifecycleForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
              required
            />
            <input
              placeholder="Notes (optional)"
              value={lifecycleForm.notes}
              onChange={(event) => setLifecycleForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <button type="submit">Add Event</button>
          </form>
          <h3>Lifecycle History {activeEmployeeId ? `(Employee: ${activeEmployeeId})` : ''}</h3>
          <ul className="simple-list">
            {lifecycleEvents.map((event) => (
              <li key={event.id}>
                {event.type} on {event.effectiveDate} {event.notes ? `- ${event.notes}` : ''}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
