import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Candidate, CandidateStage, Feedback, Interview, JobPosting, Offer, RecruitmentRole } from './recruitment.types';

interface RecruitmentContext {
  role: RecruitmentRole;
  employeeId?: string;
}

@Injectable()
export class RecruitmentService {
  private readonly jobs: JobPosting[] = [];
  private readonly candidates: Candidate[] = [];
  private readonly interviews: Interview[] = [];
  private readonly feedback: Feedback[] = [];
  private readonly offers: Offer[] = [];
  private readonly stageHistory: Array<{ candidateId: string; from: CandidateStage; to: CandidateStage; at: string }> = [];

  createJob(ctx: RecruitmentContext, payload: Omit<JobPosting, 'id'>) {
    this.assertHrAdmin(ctx);
    if (!payload.title?.trim()) {
      throw new BadRequestException('Job title is required.');
    }

    const job: JobPosting = { id: this.id('job'), ...payload };
    this.jobs.push(job);
    return job;
  }

  listJobs() {
    return this.jobs;
  }

  createCandidate(
    ctx: RecruitmentContext,
    payload: { name: string; email?: string; phone?: string; cvFileName?: string; jobId: string },
  ) {
    this.assertHrAdmin(ctx);
    if (!this.jobs.some((job) => job.id === payload.jobId)) {
      throw new BadRequestException('Job posting does not exist.');
    }

    const candidate: Candidate = {
      id: this.id('cand'),
      ...payload,
      stage: 'Applied',
    };

    this.candidates.push(candidate);
    return candidate;
  }

  listCandidates(jobId?: string) {
    return jobId ? this.candidates.filter((candidate) => candidate.jobId === jobId) : this.candidates;
  }

  moveCandidateStage(ctx: RecruitmentContext, payload: { candidateId: string; toStage: CandidateStage }) {
    this.assertHrAdmin(ctx);

    const candidate = this.candidates.find((item) => item.id === payload.candidateId);
    if (!candidate) {
      throw new NotFoundException('Candidate not found.');
    }

    if (candidate.stage === 'Hired' || candidate.stage === 'Rejected') {
      throw new BadRequestException('Final-stage candidate cannot be moved.');
    }

    const from = candidate.stage;
    candidate.stage = payload.toStage;
    this.stageHistory.push({ candidateId: candidate.id, from, to: payload.toStage, at: new Date().toISOString() });

    return candidate;
  }

  scheduleInterview(
    ctx: RecruitmentContext,
    payload: { candidateId: string; dateTime: string; interviewers: string[]; locationOrLink: string; notes?: string },
  ) {
    this.assertHrAdmin(ctx);
    this.ensureCandidate(payload.candidateId);

    const interview: Interview = {
      id: this.id('intv'),
      ...payload,
    };
    this.interviews.push(interview);
    return interview;
  }

  listInterviews(candidateId?: string) {
    return candidateId ? this.interviews.filter((interview) => interview.candidateId === candidateId) : this.interviews;
  }

  addFeedback(
    ctx: RecruitmentContext,
    payload: {
      candidateId: string;
      rating: 1 | 2 | 3 | 4 | 5;
      strengths: string;
      concerns: string;
      recommendation: 'hire' | 'maybe' | 'no';
    },
  ) {
    if (ctx.role !== 'manager' && ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only manager or HR Admin can submit feedback.');
    }

    this.ensureCandidate(payload.candidateId);

    const fb: Feedback = {
      id: this.id('fb'),
      candidateId: payload.candidateId,
      interviewerId: ctx.employeeId || 'system',
      rating: payload.rating,
      strengths: payload.strengths,
      concerns: payload.concerns,
      recommendation: payload.recommendation,
    };

    this.feedback.push(fb);
    return fb;
  }

  listFeedback(candidateId?: string) {
    return candidateId ? this.feedback.filter((item) => item.candidateId === candidateId) : this.feedback;
  }

  createOffer(
    ctx: RecruitmentContext,
    payload: { candidateId: string; proposedTitle: string; salary: number; startDate: string; notes?: string },
  ) {
    this.assertHrAdmin(ctx);
    const candidate = this.ensureCandidate(payload.candidateId);

    const offer: Offer = {
      id: this.id('off'),
      ...payload,
      status: 'Draft',
    };

    this.offers.push(offer);

    if (candidate.stage !== 'Offer') {
      this.moveCandidateStage(ctx, { candidateId: candidate.id, toStage: 'Offer' });
    }

    return offer;
  }

  updateOfferStatus(
    ctx: RecruitmentContext,
    payload: { offerId: string; status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' },
  ) {
    this.assertHrAdmin(ctx);
    const offer = this.offers.find((item) => item.id === payload.offerId);
    if (!offer) {
      throw new NotFoundException('Offer not found.');
    }

    offer.status = payload.status;
    return offer;
  }

  convertCandidateToEmployee(ctx: RecruitmentContext, payload: { candidateId: string }) {
    this.assertHrAdmin(ctx);

    const candidate = this.ensureCandidate(payload.candidateId);
    const offer = this.offers.find((item) => item.candidateId === candidate.id && item.status === 'Accepted');
    if (!offer) {
      throw new BadRequestException('Candidate requires accepted offer before conversion.');
    }

    candidate.stage = 'Hired';
    return {
      message: 'Candidate converted to employee profile payload.',
      employeeProfileDraft: {
        fullName: candidate.name,
        email: candidate.email,
        roleTitle: offer.proposedTitle,
        joinDate: offer.startDate,
      },
    };
  }

  getFunnel(jobId?: string) {
    const list = jobId ? this.candidates.filter((candidate) => candidate.jobId === jobId) : this.candidates;
    const stages: CandidateStage[] = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
    return stages.map((stage) => ({ stage, count: list.filter((candidate) => candidate.stage === stage).length }));
  }

  seedDemoData() {
    if (this.jobs.length === 0) {
      const job: JobPosting = {
        id: this.id('job'),
        title: 'Frontend Engineer',
        department: 'Engineering',
        location: 'Remote',
        description: 'Build HR product UI modules',
        status: 'open',
      };
      this.jobs.push(job);

      this.candidates.push({
        id: this.id('cand'),
        name: 'Sarah Chen',
        email: 'sarah@example.com',
        phone: '000-000',
        cvFileName: 'sarah-cv.pdf',
        jobId: job.id,
        stage: 'Applied',
      });
    }

    return { message: 'Recruitment demo baseline is ready.', jobs: this.jobs.length, candidates: this.candidates.length };
  }

  openPositionsCount() {
    return this.jobs.filter((job) => job.status === 'open').length;
  }

  private ensureCandidate(candidateId: string) {
    const candidate = this.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      throw new NotFoundException('Candidate not found.');
    }
    return candidate;
  }

  private assertHrAdmin(ctx: RecruitmentContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can perform recruitment admin actions.');
    }
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
