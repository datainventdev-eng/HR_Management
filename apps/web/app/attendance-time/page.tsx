'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

type AttendanceRecord = {
  id: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  totalHours?: number;
  isLate: boolean;
  leftEarly: boolean;
};

type Shift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

type ShiftAssignment = {
  id: string;
  employeeId: string;
  shiftId: string;
  fromDate: string;
  toDate: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function AttendanceTimePage() {
  const [employeeId, setEmployeeId] = useState('emp_demo_1');
  const [message, setMessage] = useState('');
  const [officeHours, setOfficeHours] = useState({ startTime: '09:00', endTime: '18:00' });
  const [shiftForm, setShiftForm] = useState({ name: '', startTime: '09:00', endTime: '18:00' });
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftEditForm, setShiftEditForm] = useState({ name: '', startTime: '', endTime: '' });
  const [assignmentForm, setAssignmentForm] = useState({ employeeId: '', shiftId: '', fromDate: '', toDate: '' });

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);

  async function callApi(path: string, init?: RequestInit, role: 'employee' | 'hr_admin' = 'hr_admin') {
    const session = getSession();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        'x-role': role,
        'x-employee-id': employeeId,
        ...(init?.headers || {}),
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message ?? 'Request failed.');
    }

    return payload;
  }

  async function refreshAll() {
    try {
      const [office, shiftList, assignmentList, monthly] = await Promise.all([
        callApi('/attendance/office-hours', undefined, 'employee'),
        callApi('/attendance/shifts', undefined, 'employee'),
        callApi(`/attendance/shift-assignments?employeeId=${employeeId}`),
        callApi(`/attendance/monthly?employeeId=${employeeId}`),
      ]);

      setOfficeHours(office);
      setShifts(shiftList);
      setAssignments(assignmentList);
      setRecords(monthly);
      setMessage('Attendance data refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to refresh data.');
    }
  }

  async function saveOfficeHours(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/attendance/office-hours', {
        method: 'POST',
        body: JSON.stringify(officeHours),
      });
      setMessage('Office hours updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update office hours.');
    }
  }

  async function createShift(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/attendance/shifts', {
        method: 'POST',
        body: JSON.stringify(shiftForm),
      });
      setShiftForm({ name: '', startTime: '09:00', endTime: '18:00' });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create shift.');
    }
  }

  function startShiftEdit(shift: Shift) {
    setEditingShiftId(shift.id);
    setShiftEditForm({ name: shift.name, startTime: shift.startTime, endTime: shift.endTime });
  }

  async function saveShiftEdit() {
    if (!editingShiftId) return;
    try {
      await callApi(`/attendance/shifts/${editingShiftId}`, {
        method: 'PATCH',
        body: JSON.stringify(shiftEditForm),
      });
      setEditingShiftId(null);
      setMessage('Shift updated.');
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update shift.');
    }
  }

  async function removeShift(shift: Shift) {
    if (!window.confirm(`Delete shift "${shift.name}"?`)) return;
    try {
      await callApi(`/attendance/shifts/${shift.id}`, { method: 'DELETE' });
      if (editingShiftId === shift.id) setEditingShiftId(null);
      setMessage('Shift deleted.');
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete shift.');
    }
  }

  async function assignShift(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/attendance/shift-assignments', {
        method: 'POST',
        body: JSON.stringify(assignmentForm),
      });
      setAssignmentForm({ employeeId: '', shiftId: '', fromDate: '', toDate: '' });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to assign shift.');
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <main className="attendance-page">
      <header className="card">
        <h1>Attendance and Time</h1>
        <p>Simple check-in/out, office hours, shifts, and monthly records for V1.</p>
        <FeedbackMessage message={message} />
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Office Hours (HR Admin)</h2>
          <form onSubmit={saveOfficeHours} className="form-grid">
            <input
              value={officeHours.startTime}
              onChange={(event) => setOfficeHours((prev) => ({ ...prev, startTime: event.target.value }))}
              placeholder="Start HH:MM"
            />
            <input
              value={officeHours.endTime}
              onChange={(event) => setOfficeHours((prev) => ({ ...prev, endTime: event.target.value }))}
              placeholder="End HH:MM"
            />
            <button type="submit">Save Office Hours</button>
          </form>
        </article>

        <article className="card">
          <h2>Create Shift (HR Admin)</h2>
          <form onSubmit={createShift} className="form-grid">
            <input
              value={shiftForm.name}
              onChange={(event) => setShiftForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Shift name"
              required
            />
            <input
              value={shiftForm.startTime}
              onChange={(event) => setShiftForm((prev) => ({ ...prev, startTime: event.target.value }))}
              placeholder="Start HH:MM"
              required
            />
            <input
              value={shiftForm.endTime}
              onChange={(event) => setShiftForm((prev) => ({ ...prev, endTime: event.target.value }))}
              placeholder="End HH:MM"
              required
            />
            <button type="submit">Create Shift</button>
          </form>
          <ul className="simple-list">
            {shifts.map((shift) => (
              <li key={shift.id} className="list-item-actions">
                {editingShiftId === shift.id ? (
                  <div className="inline-edit-grid">
                    <input
                      value={shiftEditForm.name}
                      onChange={(event) => setShiftEditForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Shift name"
                    />
                    <input
                      value={shiftEditForm.startTime}
                      onChange={(event) => setShiftEditForm((prev) => ({ ...prev, startTime: event.target.value }))}
                      placeholder="Start HH:MM"
                    />
                    <input
                      value={shiftEditForm.endTime}
                      onChange={(event) => setShiftEditForm((prev) => ({ ...prev, endTime: event.target.value }))}
                      placeholder="End HH:MM"
                    />
                    <div className="icon-actions">
                      <button type="button" title="Save" onClick={saveShiftEdit} aria-label="Save shift">✓</button>
                      <button type="button" title="Cancel" onClick={() => setEditingShiftId(null)} aria-label="Cancel edit">✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span>{shift.name}: {shift.startTime} - {shift.endTime}</span>
                    <div className="icon-actions">
                      <button type="button" title="Edit" onClick={() => startShiftEdit(shift)} aria-label="Edit shift">✎</button>
                      <button type="button" title="Delete" onClick={() => removeShift(shift)} aria-label="Delete shift">🗑</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Assign Shift (HR Admin)</h2>
          <form onSubmit={assignShift} className="form-grid">
            <input
              value={assignmentForm.employeeId}
              onChange={(event) => setAssignmentForm((prev) => ({ ...prev, employeeId: event.target.value }))}
              placeholder="Employee ID"
              required
            />
            <select
              value={assignmentForm.shiftId}
              onChange={(event) => setAssignmentForm((prev) => ({ ...prev, shiftId: event.target.value }))}
              required
            >
              <option value="">Select shift</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={assignmentForm.fromDate}
              onChange={(event) => setAssignmentForm((prev) => ({ ...prev, fromDate: event.target.value }))}
              required
            />
            <input
              type="date"
              value={assignmentForm.toDate}
              onChange={(event) => setAssignmentForm((prev) => ({ ...prev, toDate: event.target.value }))}
              required
            />
            <button type="submit">Assign</button>
          </form>
          <ul className="simple-list">
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                Employee {assignment.employeeId} assigned shift {assignment.shiftId} ({assignment.fromDate} to {assignment.toDate})
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Monthly Attendance</h2>
          <ul className="simple-list">
            {records.map((record) => (
              <li key={record.id}>
                {record.date}: {record.checkInTime || '-'} / {record.checkOutTime || '-'} | {record.totalHours ?? 0}h | Late:{' '}
                {record.isLate ? 'Yes' : 'No'} | Early Leave: {record.leftEarly ? 'Yes' : 'No'}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
