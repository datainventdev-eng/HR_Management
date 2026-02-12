'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getSession } from '../lib.session';

type Job = { id: string; title: string; department: string; location: string; status: 'open' | 'closed' };
type Candidate = { id: string; name: string; jobId: string; stage: string };
type Offer = { id: string; candidateId: string; status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' };

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function RecruitmentPage() {
  const [message, setMessage] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);

  const [jobForm, setJobForm] = useState({
    title: 'Frontend Engineer',
    department: 'Engineering',
    location: 'Remote',
    description: 'Build product UI modules',
    status: 'open' as 'open' | 'closed',
  });
  const [candidateForm, setCandidateForm] = useState({ name: 'New Candidate', email: '', phone: '', cvFileName: '', jobId: '' });
  const [stageForm, setStageForm] = useState({ candidateId: '', toStage: 'Screening' });
  const [interviewForm, setInterviewForm] = useState({ candidateId: '', dateTime: '', interviewers: 'mgr_demo_1', locationOrLink: 'Google Meet', notes: '' });
  const [feedbackForm, setFeedbackForm] = useState({ candidateId: '', rating: 4, strengths: 'Good communication', concerns: 'None', recommendation: 'hire' });
  const [offerForm, setOfferForm] = useState({ candidateId: '', proposedTitle: 'Software Engineer', salary: 2500, startDate: '', notes: '' });
  const [offerStatusForm, setOfferStatusForm] = useState({ offerId: '', status: 'Sent' as 'Draft' | 'Sent' | 'Accepted' | 'Declined' });

  async function callApi(path: string, init?: RequestInit, role: 'hr_admin' | 'manager' = 'hr_admin') {
    const session = getSession();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        'x-role': role,
        'x-employee-id': 'mgr_demo_1',
        ...(init?.headers || {}),
      },
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? 'Request failed.');
    return payload;
  }

  async function refreshAll() {
    try {
      const [jobList, candidateList, offerList] = await Promise.all([
        callApi('/recruitment/jobs'),
        callApi('/recruitment/candidates'),
        callApi('/recruitment/offers'),
      ]);
      setJobs(jobList);
      setCandidates(candidateList);
      setOffers(offerList);
      setMessage('Recruitment data refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to refresh recruitment data.');
    }
  }

  async function seedDemo() {
    try {
      const result = await callApi('/recruitment/seed-demo', { method: 'POST' });
      setMessage(result.message);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to seed demo data.');
    }
  }

  async function createJob(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/recruitment/jobs', { method: 'POST', body: JSON.stringify(jobForm) });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create job.');
    }
  }

  async function addCandidate(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/recruitment/candidates', { method: 'POST', body: JSON.stringify(candidateForm) });
      setCandidateForm({ name: 'New Candidate', email: '', phone: '', cvFileName: '', jobId: '' });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create candidate.');
    }
  }

  async function moveStage(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/recruitment/candidates/stage', { method: 'POST', body: JSON.stringify(stageForm) });
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to move candidate stage.');
    }
  }

  async function scheduleInterview(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/recruitment/interviews', {
        method: 'POST',
        body: JSON.stringify({ ...interviewForm, interviewers: interviewForm.interviewers.split(',').map((s) => s.trim()) }),
      });
      setMessage('Interview scheduled.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to schedule interview.');
    }
  }

  async function submitFeedback(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/recruitment/feedback', {
        method: 'POST',
        body: JSON.stringify({ ...feedbackForm, rating: Number(feedbackForm.rating) }),
      }, 'manager');
      setMessage('Interview feedback saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save feedback.');
    }
  }

  async function createOffer(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/recruitment/offers', { method: 'POST', body: JSON.stringify(offerForm) });
      await refreshAll();
      setMessage('Offer created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create offer.');
    }
  }

  async function updateOfferStatus(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/recruitment/offers/status', { method: 'POST', body: JSON.stringify(offerStatusForm) });
      await refreshAll();
      setMessage('Offer status updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update offer status.');
    }
  }

  async function convertCandidate(candidateId: string) {
    try {
      const result = await callApi('/recruitment/convert', { method: 'POST', body: JSON.stringify({ candidateId }) });
      setMessage(result.message);
      await refreshAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to convert candidate.');
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <main className="recruitment-page">
      <header className="card">
        <h1>Recruitment</h1>
        <p>Jobs, candidates, pipeline stages, interviews, feedback, offers, and candidate conversion.</p>
        <div className="row-actions">
          <button type="button" onClick={seedDemo}>Seed Demo</button>
          <button type="button" onClick={refreshAll}>Refresh</button>
        </div>
        <small>{message}</small>
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Create Job</h2>
          <form onSubmit={createJob} className="form-grid">
            <input value={jobForm.title} onChange={(e) => setJobForm((p) => ({ ...p, title: e.target.value }))} required />
            <input value={jobForm.department} onChange={(e) => setJobForm((p) => ({ ...p, department: e.target.value }))} required />
            <input value={jobForm.location} onChange={(e) => setJobForm((p) => ({ ...p, location: e.target.value }))} required />
            <input value={jobForm.description} onChange={(e) => setJobForm((p) => ({ ...p, description: e.target.value }))} required />
            <button type="submit">Create Job</button>
          </form>
          <ul className="simple-list">
            {jobs.map((job) => (
              <li key={job.id}>{job.title} ({job.department}) - {job.status}</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Create Candidate</h2>
          <form onSubmit={addCandidate} className="form-grid">
            <input value={candidateForm.name} onChange={(e) => setCandidateForm((p) => ({ ...p, name: e.target.value }))} required />
            <input placeholder="Email" value={candidateForm.email} onChange={(e) => setCandidateForm((p) => ({ ...p, email: e.target.value }))} />
            <input placeholder="Phone" value={candidateForm.phone} onChange={(e) => setCandidateForm((p) => ({ ...p, phone: e.target.value }))} />
            <input placeholder="CV file name" value={candidateForm.cvFileName} onChange={(e) => setCandidateForm((p) => ({ ...p, cvFileName: e.target.value }))} />
            <select value={candidateForm.jobId} onChange={(e) => setCandidateForm((p) => ({ ...p, jobId: e.target.value }))} required>
              <option value="">Select job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>{job.title}</option>
              ))}
            </select>
            <button type="submit">Add Candidate</button>
          </form>
        </article>

        <article className="card">
          <h2>Pipeline Stage</h2>
          <form onSubmit={moveStage} className="form-grid">
            <select value={stageForm.candidateId} onChange={(e) => setStageForm((p) => ({ ...p, candidateId: e.target.value }))} required>
              <option value="">Select candidate</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={stageForm.toStage} onChange={(e) => setStageForm((p) => ({ ...p, toStage: e.target.value }))}>
              <option>Screening</option>
              <option>Interview</option>
              <option>Offer</option>
              <option>Hired</option>
              <option>Rejected</option>
            </select>
            <button type="submit">Move Stage</button>
          </form>
          <ul className="simple-list">
            {candidates.map((c) => (
              <li key={c.id}>
                {c.name} - {c.stage}
                <button type="button" style={{ marginLeft: 8 }} onClick={() => convertCandidate(c.id)}>Convert</button>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Interview + Feedback + Offer</h2>
          <form onSubmit={scheduleInterview} className="form-grid">
            <select value={interviewForm.candidateId} onChange={(e) => setInterviewForm((p) => ({ ...p, candidateId: e.target.value }))} required>
              <option value="">Candidate for interview</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input type="datetime-local" value={interviewForm.dateTime} onChange={(e) => setInterviewForm((p) => ({ ...p, dateTime: e.target.value }))} required />
            <input value={interviewForm.interviewers} onChange={(e) => setInterviewForm((p) => ({ ...p, interviewers: e.target.value }))} placeholder="Comma separated interviewer IDs" />
            <input value={interviewForm.locationOrLink} onChange={(e) => setInterviewForm((p) => ({ ...p, locationOrLink: e.target.value }))} />
            <button type="submit">Schedule Interview</button>
          </form>

          <form onSubmit={submitFeedback} className="form-grid" style={{ marginTop: 10 }}>
            <select value={feedbackForm.candidateId} onChange={(e) => setFeedbackForm((p) => ({ ...p, candidateId: e.target.value }))} required>
              <option value="">Candidate for feedback</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input type="number" min={1} max={5} value={feedbackForm.rating} onChange={(e) => setFeedbackForm((p) => ({ ...p, rating: Number(e.target.value) }))} />
            <input value={feedbackForm.strengths} onChange={(e) => setFeedbackForm((p) => ({ ...p, strengths: e.target.value }))} />
            <input value={feedbackForm.concerns} onChange={(e) => setFeedbackForm((p) => ({ ...p, concerns: e.target.value }))} />
            <select value={feedbackForm.recommendation} onChange={(e) => setFeedbackForm((p) => ({ ...p, recommendation: e.target.value }))}>
              <option value="hire">hire</option>
              <option value="maybe">maybe</option>
              <option value="no">no</option>
            </select>
            <button type="submit">Save Feedback</button>
          </form>

          <form onSubmit={createOffer} className="form-grid" style={{ marginTop: 10 }}>
            <select value={offerForm.candidateId} onChange={(e) => setOfferForm((p) => ({ ...p, candidateId: e.target.value }))} required>
              <option value="">Candidate for offer</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input value={offerForm.proposedTitle} onChange={(e) => setOfferForm((p) => ({ ...p, proposedTitle: e.target.value }))} />
            <input type="number" min={0} value={offerForm.salary} onChange={(e) => setOfferForm((p) => ({ ...p, salary: Number(e.target.value) }))} />
            <input type="date" value={offerForm.startDate} onChange={(e) => setOfferForm((p) => ({ ...p, startDate: e.target.value }))} required />
            <button type="submit">Create Offer</button>
          </form>

          <form onSubmit={updateOfferStatus} className="form-grid" style={{ marginTop: 10 }}>
            <select value={offerStatusForm.offerId} onChange={(e) => setOfferStatusForm((p) => ({ ...p, offerId: e.target.value }))} required>
              <option value="">Select offer</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>{o.id}</option>
              ))}
            </select>
            <select value={offerStatusForm.status} onChange={(e) => setOfferStatusForm((p) => ({ ...p, status: e.target.value as Offer['status'] }))}>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Declined">Declined</option>
            </select>
            <button type="submit">Update Offer Status</button>
          </form>
        </article>
      </section>
    </main>
  );
}
