'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getSession } from '../lib.session';

type LeaveType = { id: string; name: string; paid: boolean; annualLimit?: number };
type Balance = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  allocated: number;
  used: number;
  remaining: number;
  leaveType: string;
};

type LeaveRequest = {
  id: string;
  employeeId: string;
  managerId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  managerComment?: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function LeaveManagementPage() {
  const [employeeId, setEmployeeId] = useState('emp_demo_1');
  const [managerId, setManagerId] = useState('mgr_demo_1');
  const [message, setMessage] = useState('');

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);

  const [typeForm, setTypeForm] = useState({ name: '', paid: true, annualLimit: 12 });
  const [allocForm, setAllocForm] = useState({ employeeId: 'emp_demo_1', leaveTypeId: '', allocated: 12 });
  const [requestForm, setRequestForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
  const [decisionForm, setDecisionForm] = useState({ requestId: '', decision: 'Approved' as 'Approved' | 'Rejected', managerComment: '' });

  async function callApi(path: string, init?: RequestInit, role: 'employee' | 'manager' | 'hr_admin' = 'hr_admin', userId?: string) {
    const session = getSession();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        'x-role': role,
        'x-employee-id': userId || employeeId,
        ...(init?.headers || {}),
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message ?? 'Request failed.');
    }

    return payload;
  }

  async function seedDemo() {
    try {
      const result = await callApi('/leave/seed-demo', { method: 'POST' });
      setMessage(result.message);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to seed leave demo.');
    }
  }

  async function refreshAll() {
    try {
      const [types, employeeBalances, employeeRequests] = await Promise.all([
        callApi('/leave/types', undefined, 'employee'),
        callApi('/leave/balances', undefined, 'employee', employeeId),
        callApi('/leave/requests', undefined, 'employee', employeeId),
      ]);

      setLeaveTypes(types);
      setBalances(employeeBalances);
      setRequests(employeeRequests);
      setMessage('Leave data refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to refresh leave data.');
    }
  }

  async function createType(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/leave/types', { method: 'POST', body: JSON.stringify(typeForm) });
      setTypeForm({ name: '', paid: true, annualLimit: 12 });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create leave type.');
    }
  }

  async function mapManager() {
    try {
      await callApi('/leave/manager-map', {
        method: 'POST',
        body: JSON.stringify({ employeeId, managerId }),
      });
      setMessage('Manager mapping saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to map manager.');
    }
  }

  async function allocateLeave(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/leave/allocations', { method: 'POST', body: JSON.stringify(allocForm) });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to allocate leave.');
    }
  }

  async function requestLeave(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/leave/requests', { method: 'POST', body: JSON.stringify(requestForm) }, 'employee', employeeId);
      setRequestForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to request leave.');
    }
  }

  async function approveOrReject(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/leave/requests/decision', { method: 'POST', body: JSON.stringify(decisionForm) }, 'manager', managerId);
      setDecisionForm({ requestId: '', decision: 'Approved', managerComment: '' });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update request decision.');
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <main className="leave-page">
      <header className="card">
        <h1>Leave Management</h1>
        <p>Simple leave configuration, requests, manager approvals, and balances.</p>
        <div className="form-grid compact-grid">
          <input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} placeholder="Employee ID context" />
          <input value={managerId} onChange={(event) => setManagerId(event.target.value)} placeholder="Manager ID context" />
          <div className="row-actions">
            <button type="button" onClick={seedDemo}>Seed Demo</button>
            <button type="button" onClick={mapManager}>Save Manager Map</button>
            <button type="button" onClick={refreshAll}>Refresh</button>
          </div>
        </div>
        <small>{message}</small>
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Create Leave Type (HR Admin)</h2>
          <form onSubmit={createType} className="form-grid">
            <input
              placeholder="Leave type name"
              value={typeForm.name}
              onChange={(event) => setTypeForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <select
              value={typeForm.paid ? 'paid' : 'unpaid'}
              onChange={(event) => setTypeForm((prev) => ({ ...prev, paid: event.target.value === 'paid' }))}
            >
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <input
              type="number"
              value={typeForm.annualLimit}
              onChange={(event) => setTypeForm((prev) => ({ ...prev, annualLimit: Number(event.target.value) }))}
              min={0}
            />
            <button type="submit">Create Leave Type</button>
          </form>
          <ul className="simple-list">
            {leaveTypes.map((type) => (
              <li key={type.id}>{type.name} ({type.paid ? 'Paid' : 'Unpaid'})</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Allocate Leave (HR Admin)</h2>
          <form onSubmit={allocateLeave} className="form-grid">
            <input
              value={allocForm.employeeId}
              onChange={(event) => setAllocForm((prev) => ({ ...prev, employeeId: event.target.value }))}
              placeholder="Employee ID"
              required
            />
            <select
              value={allocForm.leaveTypeId}
              onChange={(event) => setAllocForm((prev) => ({ ...prev, leaveTypeId: event.target.value }))}
              required
            >
              <option value="">Select leave type</option>
              {leaveTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
            <input
              type="number"
              value={allocForm.allocated}
              onChange={(event) => setAllocForm((prev) => ({ ...prev, allocated: Number(event.target.value) }))}
              min={0}
              required
            />
            <button type="submit">Save Allocation</button>
          </form>
        </article>

        <article className="card">
          <h2>Request Leave (Employee)</h2>
          <form onSubmit={requestLeave} className="form-grid">
            <select
              value={requestForm.leaveTypeId}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, leaveTypeId: event.target.value }))}
              required
            >
              <option value="">Select leave type</option>
              {leaveTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={requestForm.startDate}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, startDate: event.target.value }))}
              required
            />
            <input
              type="date"
              value={requestForm.endDate}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, endDate: event.target.value }))}
              required
            />
            <input
              placeholder="Reason (optional)"
              value={requestForm.reason}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, reason: event.target.value }))}
            />
            <button type="submit">Submit Request</button>
          </form>
          <ul className="simple-list">
            {requests.map((request) => (
              <li key={request.id}>
                {request.startDate} to {request.endDate} ({request.days} day(s)) - {request.status}
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Manager Decision</h2>
          <form onSubmit={approveOrReject} className="form-grid">
            <select
              value={decisionForm.requestId}
              onChange={(event) => setDecisionForm((prev) => ({ ...prev, requestId: event.target.value }))}
              required
            >
              <option value="">Select pending request</option>
              {requests.filter((request) => request.status === 'Pending').map((request) => (
                <option key={request.id} value={request.id}>{request.id}</option>
              ))}
            </select>
            <select
              value={decisionForm.decision}
              onChange={(event) => setDecisionForm((prev) => ({ ...prev, decision: event.target.value as 'Approved' | 'Rejected' }))}
            >
              <option value="Approved">Approve</option>
              <option value="Rejected">Reject</option>
            </select>
            <input
              placeholder="Comment (optional)"
              value={decisionForm.managerComment}
              onChange={(event) => setDecisionForm((prev) => ({ ...prev, managerComment: event.target.value }))}
            />
            <button type="submit">Submit Decision</button>
          </form>
          <h3>Leave Balances</h3>
          <ul className="simple-list">
            {balances.map((balance) => (
              <li key={balance.id}>
                {balance.leaveType}: allocated {balance.allocated}, used {balance.used}, remaining {balance.remaining}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
