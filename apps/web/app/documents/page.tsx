'use client';

import { FormEvent, useState } from 'react';

type PolicyDoc = { id: string; title: string; fileName: string; published: boolean };
type EmployeeDoc = { id: string; employeeId: string; name: string; fileName: string; expiresOn?: string };

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function DocumentsPage() {
  const [employeeId, setEmployeeId] = useState('emp_demo_1');
  const [message, setMessage] = useState('');
  const [policies, setPolicies] = useState<PolicyDoc[]>([]);
  const [employeeDocs, setEmployeeDocs] = useState<EmployeeDoc[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<EmployeeDoc[]>([]);

  const [policyForm, setPolicyForm] = useState({ title: 'Code of Conduct', fileName: 'code-of-conduct.pdf', published: true });
  const [docForm, setDocForm] = useState({ employeeId: 'emp_demo_1', name: 'Passport', fileName: 'passport.pdf', expiresOn: '' });

  async function callApi(path: string, init?: RequestInit, role: 'hr_admin' | 'employee' = 'hr_admin', id?: string) {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-role': role,
        'x-employee-id': id || employeeId,
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
      const [policyList, docList, expiringList] = await Promise.all([
        callApi('/documents/policy', undefined, 'hr_admin'),
        callApi(`/documents/employee?employeeId=${employeeId}`, undefined, 'hr_admin'),
        callApi('/documents/expiring', undefined, 'hr_admin'),
      ]);

      setPolicies(policyList);
      setEmployeeDocs(docList);
      setExpiringDocs(expiringList);
      setMessage('Documents data refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to refresh documents data.');
    }
  }

  async function seedDemo() {
    try {
      const result = await callApi('/documents/seed-demo', { method: 'POST' });
      setMessage(result.message);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to seed documents baseline.');
    }
  }

  async function publishPolicy(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/documents/policy', { method: 'POST', body: JSON.stringify(policyForm) });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to publish policy.');
    }
  }

  async function uploadEmployeeDoc(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/documents/employee', { method: 'POST', body: JSON.stringify(docForm) });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to upload employee document.');
    }
  }

  return (
    <main className="documents-page">
      <header className="card">
        <h1>Documents</h1>
        <p>Employee documents, company policies, and expiring-document visibility.</p>
        <div className="form-grid compact-grid">
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Employee ID" />
          <div className="row-actions">
            <button type="button" onClick={seedDemo}>Seed Demo</button>
            <button type="button" onClick={refreshAll}>Refresh</button>
          </div>
        </div>
        <small>{message}</small>
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Publish Policy (HR Admin)</h2>
          <form onSubmit={publishPolicy} className="form-grid">
            <input value={policyForm.title} onChange={(e) => setPolicyForm((p) => ({ ...p, title: e.target.value }))} required />
            <input value={policyForm.fileName} onChange={(e) => setPolicyForm((p) => ({ ...p, fileName: e.target.value }))} required />
            <select
              value={policyForm.published ? 'published' : 'draft'}
              onChange={(e) => setPolicyForm((p) => ({ ...p, published: e.target.value === 'published' }))}
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
            <button type="submit">Save Policy</button>
          </form>
          <ul className="simple-list">
            {policies.map((policy) => (
              <li key={policy.id}>{policy.title} ({policy.published ? 'Published' : 'Draft'})</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Upload Employee Document (HR Admin)</h2>
          <form onSubmit={uploadEmployeeDoc} className="form-grid">
            <input value={docForm.employeeId} onChange={(e) => setDocForm((p) => ({ ...p, employeeId: e.target.value }))} required />
            <input value={docForm.name} onChange={(e) => setDocForm((p) => ({ ...p, name: e.target.value }))} required />
            <input value={docForm.fileName} onChange={(e) => setDocForm((p) => ({ ...p, fileName: e.target.value }))} required />
            <input type="date" value={docForm.expiresOn} onChange={(e) => setDocForm((p) => ({ ...p, expiresOn: e.target.value }))} />
            <button type="submit">Upload Document</button>
          </form>
          <ul className="simple-list">
            {employeeDocs.map((doc) => (
              <li key={doc.id}>{doc.name} ({doc.fileName}) {doc.expiresOn ? `exp: ${doc.expiresOn}` : ''}</li>
            ))}
          </ul>
        </article>

        <article className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Expiring in Next 30 Days (HR Admin)</h2>
          <ul className="simple-list">
            {expiringDocs.map((doc) => (
              <li key={doc.id}>{doc.name} - {doc.employeeId} - expires on {doc.expiresOn}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
