'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

type WfhRequest = {
  id: string;
  employeeId: string;
  employeeName?: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  managerComment?: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function WfhPage() {
  const router = useRouter();
  const session = getSession();
  const role = session?.user.role ?? 'employee';
  const isEmployee = role === 'employee';
  const employeeId = session?.user.employeeId || session?.user.id || '';

  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState<WfhRequest[]>([]);
  const [requestForm, setRequestForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [decisionForm, setDecisionForm] = useState({ requestId: '', decision: 'Approved' as 'Approved' | 'Rejected', managerComment: '' });

  async function parsePayload(response: Response) {
    const raw = await response.text();
    if (!raw) return {} as any;
    try {
      return JSON.parse(raw) as any;
    } catch {
      return { message: raw } as any;
    }
  }

  async function callApi(path: string, init?: RequestInit, roleOverride?: 'employee' | 'manager' | 'hr_admin') {
    const activeSession = getSession();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(activeSession?.accessToken ? { Authorization: `Bearer ${activeSession.accessToken}` } : {}),
        'x-role': roleOverride || (role as 'employee' | 'manager' | 'hr_admin'),
        'x-employee-id': activeSession?.user.employeeId || activeSession?.user.id || '',
        ...(init?.headers || {}),
      },
    });

    const payload = await parsePayload(response);
    if (!response.ok) {
      throw new Error(payload.message ?? 'Request failed.');
    }
    return payload;
  }

  async function refreshAll() {
    try {
      const path = isEmployee ? '/wfh/requests' : '/wfh/requests';
      const data = await callApi(path);
      setRequests(Array.isArray(data) ? data : []);
      setMessage('WFH data refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to refresh WFH data.');
    }
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/wfh/requests', {
        method: 'POST',
        body: JSON.stringify(requestForm),
      }, 'employee');
      setRequestForm({ startDate: '', endDate: '', reason: '' });
      setMessage('WFH request submitted successfully.');
      await refreshAll();
      if (isEmployee) {
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
          } else {
            router.push('/employee');
          }
        }, 900);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to submit WFH request.');
    }
  }

  async function submitDecision(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/wfh/requests/decision', {
        method: 'POST',
        body: JSON.stringify(decisionForm),
      });
      setDecisionForm({ requestId: '', decision: 'Approved', managerComment: '' });
      setMessage('WFH decision submitted successfully.');
      await refreshAll();
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push('/');
        }
      }, 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to submit decision.');
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  const pendingRequests = useMemo(() => requests.filter((request) => request.status === 'Pending'), [requests]);
  const myRequests = useMemo(() => requests.filter((request) => request.employeeId === employeeId), [requests, employeeId]);

  function formatDateLabel(dateText: string) {
    const [year, month, day] = dateText.slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dt);
  }

  function formatDateRange(startDate: string, endDate: string) {
    if (startDate === endDate) return formatDateLabel(startDate);
    return `${formatDateLabel(startDate)} to ${formatDateLabel(endDate)}`;
  }

  const requestList = isEmployee ? myRequests : requests;

  return (
    <main className="leave-page">
      <header className="card">
        <h1>WFH Request</h1>
        <p>Submit work from home request and track request status.</p>
        <FeedbackMessage message={message} />
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Request WFH ({isEmployee ? 'Employee' : 'Team'})</h2>
          <form onSubmit={submitRequest} className="form-grid">
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
              placeholder="Reason"
              value={requestForm.reason}
              onChange={(event) => setRequestForm((prev) => ({ ...prev, reason: event.target.value }))}
              required
            />
            <button type="submit">Submit Request</button>
          </form>

          <h3 style={{ marginTop: 14 }}>My Requests</h3>
          <ul className="simple-list">
            {requestList.slice(0, 8).map((request) => (
              <li key={request.id}>
                {(isEmployee ? '' : `${request.employeeName || request.employeeId} - `)}
                {formatDateRange(request.startDate, request.endDate)} - {request.status}
              </li>
            ))}
            {requestList.length === 0 && <li>No WFH requests yet.</li>}
          </ul>
        </article>

        {!isEmployee && (
          <article className="card">
            <h2>Manager Decision</h2>
            <p className="pending-orange-text">{pendingRequests.length} pending request(s) need approval.</p>
            <ul className="simple-list pending-orange-list">
              {pendingRequests.slice(0, 6).map((request) => (
                <li key={request.id}>
                  {request.employeeName || request.employeeId} - {formatDateRange(request.startDate, request.endDate)}
                </li>
              ))}
              {pendingRequests.length === 0 && <li>No pending WFH requests.</li>}
            </ul>

            <form onSubmit={submitDecision} className="form-grid">
              <select
                value={decisionForm.requestId}
                onChange={(event) => setDecisionForm((prev) => ({ ...prev, requestId: event.target.value }))}
                required
              >
                <option value="">Select pending request</option>
                {pendingRequests.map((request) => (
                  <option key={request.id} value={request.id}>
                    {(request.employeeName || request.employeeId)} - {formatDateRange(request.startDate, request.endDate)}
                  </option>
                ))}
              </select>

              <select
                value={decisionForm.decision}
                onChange={(event) =>
                  setDecisionForm((prev) => ({ ...prev, decision: event.target.value as 'Approved' | 'Rejected' }))
                }
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
        )}
      </section>
    </main>
  );
}
