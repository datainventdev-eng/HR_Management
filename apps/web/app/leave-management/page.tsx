'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

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
type EmployeeOption = { id: string; fullName: string };

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function LeaveManagementPage() {
  const router = useRouter();
  const session = getSession();
  const currentRole = session?.user.role ?? 'hr_admin';
  const isEmployee = currentRole === 'employee';
  const approverEmployeeId = session?.user.employeeId ?? session?.user.id ?? '';

  const defaultEmployeeId = session?.user.employeeId ?? session?.user.id ?? 'emp_demo_1';
  const defaultManagerId = currentRole === 'manager' ? defaultEmployeeId : 'mgr_demo_1';

  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [managerId, setManagerId] = useState(defaultManagerId);
  const [message, setMessage] = useState('');

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [typeForm, setTypeForm] = useState({ name: '', paid: true, annualLimit: 12 });
  const [editingLeaveTypeId, setEditingLeaveTypeId] = useState<string | null>(null);
  const [editTypeForm, setEditTypeForm] = useState({ name: '', paid: true, annualLimit: 12 });
  const [requestForm, setRequestForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
  const [decisionForm, setDecisionForm] = useState({ requestId: '', decision: 'Approved' as 'Approved' | 'Rejected', managerComment: '' });

  async function callApi(
    path: string,
    init?: RequestInit,
    role: 'employee' | 'manager' | 'hr_admin' = currentRole,
    userId?: string,
  ) {
    const activeSession = getSession();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(activeSession?.accessToken ? { Authorization: `Bearer ${activeSession.accessToken}` } : {}),
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

  function navigateBackAfterSuccess() {
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
        return;
      }
      router.push(isEmployee ? '/employee' : '/');
    }, 900);
  }

  function formatDateLabel(dateText: string) {
    const normalized = dateText.slice(0, 10);
    const [yearText, monthText, dayText] = normalized.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!year || !month || !day) {
      return dateText;
    }
    const dt = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dt);
  }

  function formatDateRange(startDate: string, endDate: string) {
    if (startDate === endDate) {
      return formatDateLabel(startDate);
    }
    return `${formatDateLabel(startDate)} to ${formatDateLabel(endDate)}`;
  }

  async function seedDemo() {
    try {
      const result = await callApi('/leave/seed-demo', { method: 'POST' }, 'hr_admin');
      setMessage(result.message);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to seed leave demo.');
    }
  }

  async function refreshAll() {
    const targetEmployeeId = employeeId.trim();

    if (isEmployee) {
      try {
        const [types, employeeBalances, employeeRequests] = await Promise.all([
          callApi('/leave/types', undefined, 'employee', targetEmployeeId),
          callApi('/leave/balances', undefined, 'employee', targetEmployeeId),
          callApi('/leave/requests', undefined, 'employee', targetEmployeeId),
        ]);

        setLeaveTypes(types);
        setBalances(employeeBalances);
        setRequests(employeeRequests);
        setMessage('Leave data refreshed.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to refresh leave data.');
      }
      return;
    }

    const requestsPath = '/leave/requests';
    const balancesPath = targetEmployeeId
      ? `/leave/balances?employeeId=${encodeURIComponent(targetEmployeeId)}`
      : '/leave/balances';

    const [typesResult, balancesResult, requestsResult] = await Promise.allSettled([
      callApi('/leave/types', undefined, 'hr_admin'),
      callApi(balancesPath, undefined, 'hr_admin'),
      callApi(requestsPath, undefined, 'hr_admin'),
    ]);

    const employeeResult = await Promise.allSettled([
      callApi('/core-hr/employees', undefined, currentRole),
    ]);

    if (typesResult.status === 'fulfilled') {
      setLeaveTypes(typesResult.value);
    } else {
      setMessage(typesResult.reason instanceof Error ? typesResult.reason.message : 'Failed to load leave types.');
      return;
    }

    if (balancesResult.status === 'fulfilled') {
      setBalances(balancesResult.value);
    } else {
      setBalances([]);
    }

    if (requestsResult.status === 'fulfilled') {
      setRequests(requestsResult.value);
    } else {
      setRequests([]);
    }

    if (employeeResult[0].status === 'fulfilled') {
      const mapped = (employeeResult[0].value || []).map((row: any) => ({
        id: row.id as string,
        fullName: row.fullName as string,
      }));
      setEmployees(mapped);
    } else {
      setEmployees([]);
    }

    if (balancesResult.status === 'rejected' || requestsResult.status === 'rejected') {
      setMessage('Leave types updated. Some data could not be loaded for the selected employee/manager context.');
      return;
    }

    setMessage('Leave data refreshed.');
  }

  async function createType(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/leave/types', { method: 'POST', body: JSON.stringify(typeForm) }, 'hr_admin');
      setTypeForm({ name: '', paid: true, annualLimit: 12 });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create leave type.');
    }
  }

  function startEditLeaveType(type: LeaveType) {
    setEditingLeaveTypeId(type.id);
    setEditTypeForm({ name: type.name, paid: type.paid, annualLimit: type.annualLimit ?? 12 });
  }

  function cancelEditLeaveType() {
    setEditingLeaveTypeId(null);
  }

  async function saveLeaveTypeEdit() {
    if (!editingLeaveTypeId) {
      return;
    }

    try {
      await callApi(`/leave/types/${editingLeaveTypeId}`, {
        method: 'PATCH',
        body: JSON.stringify(editTypeForm),
      }, 'hr_admin');
      setMessage('Leave type updated successfully.');
      setEditingLeaveTypeId(null);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update leave type.');
    }
  }

  async function removeLeaveType(type: LeaveType) {
    if (!window.confirm(`Delete "${type.name}" leave type?`)) {
      return;
    }

    try {
      await callApi(`/leave/types/${type.id}`, { method: 'DELETE' }, 'hr_admin');
      setMessage('Leave type deleted successfully.');
      if (editingLeaveTypeId === type.id) {
        setEditingLeaveTypeId(null);
      }
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete leave type.');
    }
  }

  async function mapManager() {
    try {
      await callApi('/leave/manager-map', {
        method: 'POST',
        body: JSON.stringify({ employeeId, managerId }),
      }, 'hr_admin');
      setMessage('Manager mapping saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to map manager.');
    }
  }

  async function requestLeave(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/leave/requests', { method: 'POST', body: JSON.stringify(requestForm) }, 'employee', employeeId.trim());
      setRequestForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
      setMessage('Leave request submitted successfully. Returning...');
      navigateBackAfterSuccess();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to request leave.');
    }
  }

  async function approveOrReject(event: FormEvent) {
    event.preventDefault();
    try {
      const roleForDecision = currentRole === 'hr_admin' ? 'hr_admin' : 'manager';
      const userIdForDecision = currentRole === 'hr_admin' ? employeeId : managerId;
      await callApi('/leave/requests/decision', { method: 'POST', body: JSON.stringify(decisionForm) }, roleForDecision, userIdForDecision);
      setDecisionForm({ requestId: '', decision: 'Approved', managerComment: '' });
      setMessage('Decision saved successfully. Returning...');
      navigateBackAfterSuccess();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update request decision.');
    }
  }

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const employee of employees) {
      map.set(employee.id, employee.fullName);
    }
    return map;
  }, [employees]);
  const leaveTypeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const leaveType of leaveTypes) {
      map.set(leaveType.id, leaveType.name);
    }
    return map;
  }, [leaveTypes]);

  const selectedBalance = useMemo(
    () => balances.find((item) => item.leaveTypeId === requestForm.leaveTypeId),
    [balances, requestForm.leaveTypeId],
  );
  const selectedRemaining = selectedBalance?.remaining ?? 0;

  const requestedDays = useMemo(() => {
    if (!requestForm.startDate || !requestForm.endDate) {
      return 0;
    }

    const start = new Date(requestForm.startDate);
    const end = new Date(requestForm.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return 0;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  }, [requestForm.startDate, requestForm.endDate]);

  const noAllocationForSelected = Boolean(requestForm.leaveTypeId) && !selectedBalance;
  const insufficientBalance = Boolean(selectedBalance) && requestedDays > 0 && selectedRemaining < requestedDays;
  const pendingCount = useMemo(() => requests.filter((request) => request.status === 'Pending').length, [requests]);
  const latestEmployeeRequest = useMemo(() => (requests.length > 0 ? requests[0] : null), [requests]);
  const pendingForApproval = useMemo(
    () =>
      requests.filter((request) => {
        if (request.status !== 'Pending') return false;
        if (currentRole === 'hr_admin') return true;
        return request.managerId === approverEmployeeId;
      }),
    [requests, currentRole, approverEmployeeId],
  );

  useEffect(() => {
    void refreshAll();
  }, []);

  if (isEmployee) {
    return (
      <main className="leave-page">
        <header className="card">
          <h1>Leave Request</h1>
          <p>Submit leave request and check your remaining quota by leave type.</p>
          <p>{pendingCount} leave request(s) pending.</p>
          {latestEmployeeRequest ? (
            <div className={`leave-status-banner ${latestEmployeeRequest.status.toLowerCase()}`}>
              Your last leave request was {latestEmployeeRequest.status}
              {' '}
              ({formatDateRange(latestEmployeeRequest.startDate, latestEmployeeRequest.endDate)}).
            </div>
          ) : (
            <div className="leave-status-banner neutral">You do not have any leave requests yet.</div>
          )}
          <FeedbackMessage message={message} />
        </header>

        <section className="core-hr-grid">
          <article className="card">
            <h2>Your Leave Quota</h2>
            <ul className="simple-list">
              {leaveTypes.map((type) => {
                const balance = balances.find((item) => item.leaveTypeId === type.id);
                const allocated = balance?.allocated ?? 0;
                const used = balance?.used ?? 0;
                const remaining = balance?.remaining ?? 0;
                return (
                  <li key={type.id}>
                    {type.name}: allocated {allocated} day(s), used {used} day(s), remaining {remaining} day(s)
                  </li>
                );
              })}
            </ul>
          </article>

          <article className="card">
            <h2>Request Leave</h2>
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
              {noAllocationForSelected && (
                <small className="text-danger">No leave quota allocated for selected leave type.</small>
              )}
              {insufficientBalance && (
                <small className="text-danger">
                  Requested {requestedDays} day(s), but only {selectedRemaining} day(s) remaining.
                </small>
              )}
              <button type="submit" disabled={noAllocationForSelected || insufficientBalance}>Submit Request</button>
            </form>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="leave-page">
      <header className="card">
        <h1>Leave Management</h1>
        <p>Simple leave configuration, requests, manager approvals, and balances.</p>
        <p>You have {pendingForApproval.length} pending leave request(s) to approve.</p>
        <FeedbackMessage message={message} />
      </header>

      <article className="card">
        <h2>Leave Balances (Employee Context)</h2>
        <ul className="simple-list">
          {balances.map((balance) => (
            <li key={balance.id}>
              {balance.leaveType}: allocated {balance.allocated}, used {balance.used}, remaining {balance.remaining}
            </li>
          ))}
          {balances.length === 0 ? <li>No leave balances found for selected employee context.</li> : null}
        </ul>
      </article>

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
              <li key={type.id} className="list-item-actions">
                {editingLeaveTypeId === type.id ? (
                  <div className="inline-edit-grid">
                    <input
                      value={editTypeForm.name}
                      onChange={(event) => setEditTypeForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Leave type name"
                    />
                    <select
                      value={editTypeForm.paid ? 'paid' : 'unpaid'}
                      onChange={(event) => setEditTypeForm((prev) => ({ ...prev, paid: event.target.value === 'paid' }))}
                    >
                      <option value="paid">Paid</option>
                      <option value="unpaid">Unpaid</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={editTypeForm.annualLimit}
                      onChange={(event) => setEditTypeForm((prev) => ({ ...prev, annualLimit: Number(event.target.value) }))}
                    />
                    <div className="icon-actions">
                      <button type="button" title="Save" onClick={saveLeaveTypeEdit} aria-label="Save leave type">✓</button>
                      <button type="button" title="Cancel" onClick={cancelEditLeaveType} aria-label="Cancel edit">✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span>{type.name} ({type.paid ? 'Paid' : 'Unpaid'})</span>
                    <div className="icon-actions">
                      <button type="button" title="Edit" onClick={() => startEditLeaveType(type)} aria-label="Edit leave type">✎</button>
                      <button type="button" title="Delete" onClick={() => removeLeaveType(type)} aria-label="Delete leave type">🗑</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Manager Decision</h2>
          <p className="pending-orange-text">{pendingForApproval.length} pending request(s) need approval.</p>
          <ul className="simple-list pending-orange-list">
            {pendingForApproval.slice(0, 5).map((request) => (
              <li key={request.id}>
                {(employeeNameById.get(request.employeeId) || request.employeeId)}
                {' - '}
                {leaveTypeNameById.get(request.leaveTypeId) || request.leaveTypeId}
                {' - '}
                {formatDateRange(request.startDate, request.endDate)}
              </li>
            ))}
            {pendingForApproval.length === 0 ? <li>No pending requests right now.</li> : null}
          </ul>
          <form onSubmit={approveOrReject} className="form-grid">
            <select
              value={decisionForm.requestId}
              onChange={(event) => setDecisionForm((prev) => ({ ...prev, requestId: event.target.value }))}
              required
            >
              <option value="">Select pending request</option>
              {pendingForApproval.map((request) => (
                <option key={request.id} value={request.id}>
                  {(employeeNameById.get(request.employeeId) || request.employeeId)}
                  {' - '}
                  {leaveTypeNameById.get(request.leaveTypeId) || request.leaveTypeId}
                  {' - '}
                  {formatDateRange(request.startDate, request.endDate)}
                </option>
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
        </article>
      </section>
    </main>
  );
}
