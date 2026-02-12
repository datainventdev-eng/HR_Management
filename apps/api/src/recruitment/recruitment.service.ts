import { BadRequestException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { Candidate, CandidateStage, Feedback, Interview, JobPosting, Offer, RecruitmentRole } from './recruitment.types';
import { DatabaseService } from '../database/database.service';

interface RecruitmentContext {
  role: RecruitmentRole;
  employeeId?: string;
}

interface DbJob {
  id: string;
  title: string;
  department: string;
  location: string;
  description: string;
  status: 'open' | 'closed';
}

interface DbCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cv_file_name: string | null;
  job_id: string;
  stage: CandidateStage;
}

@Injectable()
export class RecruitmentService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS recruitment_jobs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        department TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open','closed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS recruitment_candidates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        cv_file_name TEXT,
        job_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('Applied','Screening','Interview','Offer','Hired','Rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_recruitment_candidate_job FOREIGN KEY (job_id) REFERENCES recruitment_jobs(id)
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS recruitment_stage_history (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        from_stage TEXT NOT NULL,
        to_stage TEXT NOT NULL,
        at TIMESTAMPTZ NOT NULL,
        CONSTRAINT fk_recruitment_history_candidate FOREIGN KEY (candidate_id) REFERENCES recruitment_candidates(id) ON DELETE CASCADE
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS recruitment_interviews (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        date_time TIMESTAMPTZ NOT NULL,
        interviewers JSONB NOT NULL,
        location_or_link TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_recruitment_interview_candidate FOREIGN KEY (candidate_id) REFERENCES recruitment_candidates(id) ON DELETE CASCADE
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS recruitment_feedback (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        interviewer_id TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        strengths TEXT NOT NULL,
        concerns TEXT NOT NULL,
        recommendation TEXT NOT NULL CHECK (recommendation IN ('hire','maybe','no')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_recruitment_feedback_candidate FOREIGN KEY (candidate_id) REFERENCES recruitment_candidates(id) ON DELETE CASCADE
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS recruitment_offers (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        proposed_title TEXT NOT NULL,
        salary NUMERIC(12,2) NOT NULL,
        start_date DATE NOT NULL,
        notes TEXT,
        status TEXT NOT NULL CHECK (status IN ('Draft','Sent','Accepted','Declined')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_recruitment_offer_candidate FOREIGN KEY (candidate_id) REFERENCES recruitment_candidates(id) ON DELETE CASCADE
      );
    `);
  }

  async createJob(ctx: RecruitmentContext, payload: Omit<JobPosting, 'id'>) {
    this.assertHrAdmin(ctx);
    if (!payload.title?.trim()) {
      throw new BadRequestException('Job title is required.');
    }

    const job: JobPosting = { id: this.id('job'), ...payload };
    await this.db.query(
      `
      INSERT INTO recruitment_jobs (id, title, department, location, description, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [job.id, job.title, job.department, job.location, job.description, job.status],
    );

    return job;
  }

  async listJobs() {
    const result = await this.db.query<DbJob>(
      `SELECT id, title, department, location, description, status FROM recruitment_jobs ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  async createCandidate(
    ctx: RecruitmentContext,
    payload: { name: string; email?: string; phone?: string; cvFileName?: string; jobId: string },
  ) {
    this.assertHrAdmin(ctx);

    const job = await this.db.query<{ id: string }>(`SELECT id FROM recruitment_jobs WHERE id = $1 LIMIT 1`, [payload.jobId]);
    if (!job.rows[0]) {
      throw new BadRequestException('Job posting does not exist.');
    }

    const candidate: Candidate = {
      id: this.id('cand'),
      ...payload,
      stage: 'Applied',
    };

    await this.db.query(
      `
      INSERT INTO recruitment_candidates (id, name, email, phone, cv_file_name, job_id, stage)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        candidate.id,
        candidate.name,
        candidate.email ?? null,
        candidate.phone ?? null,
        candidate.cvFileName ?? null,
        candidate.jobId,
        candidate.stage,
      ],
    );

    return candidate;
  }

  async listCandidates(jobId?: string) {
    const result = jobId
      ? await this.db.query<DbCandidate>(
          `SELECT id, name, email, phone, cv_file_name, job_id, stage FROM recruitment_candidates WHERE job_id = $1 ORDER BY created_at DESC`,
          [jobId],
        )
      : await this.db.query<DbCandidate>(
          `SELECT id, name, email, phone, cv_file_name, job_id, stage FROM recruitment_candidates ORDER BY created_at DESC`,
        );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      cvFileName: row.cv_file_name ?? undefined,
      jobId: row.job_id,
      stage: row.stage,
    }));
  }

  async moveCandidateStage(ctx: RecruitmentContext, payload: { candidateId: string; toStage: CandidateStage }) {
    this.assertHrAdmin(ctx);

    const candidate = await this.ensureCandidate(payload.candidateId);

    if (candidate.stage === 'Hired' || candidate.stage === 'Rejected') {
      throw new BadRequestException('Final-stage candidate cannot be moved.');
    }

    const from = candidate.stage;

    await this.db.transaction(async (query) => {
      await query(`UPDATE recruitment_candidates SET stage = $2 WHERE id = $1`, [candidate.id, payload.toStage]);
      await query(
        `INSERT INTO recruitment_stage_history (id, candidate_id, from_stage, to_stage, at) VALUES ($1, $2, $3, $4, NOW())`,
        [this.id('stg'), candidate.id, from, payload.toStage],
      );
    });

    return {
      ...candidate,
      stage: payload.toStage,
    };
  }

  async scheduleInterview(
    ctx: RecruitmentContext,
    payload: { candidateId: string; dateTime: string; interviewers: string[]; locationOrLink: string; notes?: string },
  ) {
    this.assertHrAdmin(ctx);
    await this.ensureCandidate(payload.candidateId);

    const interview: Interview = {
      id: this.id('intv'),
      ...payload,
    };

    await this.db.query(
      `
      INSERT INTO recruitment_interviews (id, candidate_id, date_time, interviewers, location_or_link, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        interview.id,
        interview.candidateId,
        interview.dateTime,
        JSON.stringify(interview.interviewers),
        interview.locationOrLink,
        interview.notes ?? null,
      ],
    );

    return interview;
  }

  async listInterviews(candidateId?: string) {
    const result = candidateId
      ? await this.db.query<{
          id: string;
          candidate_id: string;
          date_time: string;
          interviewers: string[];
          location_or_link: string;
          notes: string | null;
        }>(
          `
          SELECT id, candidate_id, date_time::text AS date_time, interviewers, location_or_link, notes
          FROM recruitment_interviews
          WHERE candidate_id = $1
          ORDER BY date_time DESC
          `,
          [candidateId],
        )
      : await this.db.query<{
          id: string;
          candidate_id: string;
          date_time: string;
          interviewers: string[];
          location_or_link: string;
          notes: string | null;
        }>(
          `
          SELECT id, candidate_id, date_time::text AS date_time, interviewers, location_or_link, notes
          FROM recruitment_interviews
          ORDER BY date_time DESC
          `,
        );

    return result.rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      dateTime: row.date_time,
      interviewers: row.interviewers,
      locationOrLink: row.location_or_link,
      notes: row.notes ?? undefined,
    }));
  }

  async addFeedback(
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

    await this.ensureCandidate(payload.candidateId);

    const fb: Feedback = {
      id: this.id('fb'),
      candidateId: payload.candidateId,
      interviewerId: ctx.employeeId || 'system',
      rating: payload.rating,
      strengths: payload.strengths,
      concerns: payload.concerns,
      recommendation: payload.recommendation,
    };

    await this.db.query(
      `
      INSERT INTO recruitment_feedback (id, candidate_id, interviewer_id, rating, strengths, concerns, recommendation)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [fb.id, fb.candidateId, fb.interviewerId, fb.rating, fb.strengths, fb.concerns, fb.recommendation],
    );

    return fb;
  }

  async listFeedback(candidateId?: string) {
    const result = candidateId
      ? await this.db.query<{
          id: string;
          candidate_id: string;
          interviewer_id: string;
          rating: 1 | 2 | 3 | 4 | 5;
          strengths: string;
          concerns: string;
          recommendation: 'hire' | 'maybe' | 'no';
        }>(
          `
          SELECT id, candidate_id, interviewer_id, rating, strengths, concerns, recommendation
          FROM recruitment_feedback
          WHERE candidate_id = $1
          ORDER BY created_at DESC
          `,
          [candidateId],
        )
      : await this.db.query<{
          id: string;
          candidate_id: string;
          interviewer_id: string;
          rating: 1 | 2 | 3 | 4 | 5;
          strengths: string;
          concerns: string;
          recommendation: 'hire' | 'maybe' | 'no';
        }>(
          `
          SELECT id, candidate_id, interviewer_id, rating, strengths, concerns, recommendation
          FROM recruitment_feedback
          ORDER BY created_at DESC
          `,
        );

    return result.rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      interviewerId: row.interviewer_id,
      rating: row.rating,
      strengths: row.strengths,
      concerns: row.concerns,
      recommendation: row.recommendation,
    }));
  }

  async createOffer(
    ctx: RecruitmentContext,
    payload: { candidateId: string; proposedTitle: string; salary: number; startDate: string; notes?: string },
  ) {
    this.assertHrAdmin(ctx);
    const candidate = await this.ensureCandidate(payload.candidateId);

    const offer: Offer = {
      id: this.id('off'),
      ...payload,
      status: 'Draft',
    };

    await this.db.query(
      `
      INSERT INTO recruitment_offers (id, candidate_id, proposed_title, salary, start_date, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [offer.id, offer.candidateId, offer.proposedTitle, offer.salary, offer.startDate, offer.notes ?? null, offer.status],
    );

    if (candidate.stage !== 'Offer') {
      await this.moveCandidateStage(ctx, { candidateId: candidate.id, toStage: 'Offer' });
    }

    return offer;
  }

  async updateOfferStatus(
    ctx: RecruitmentContext,
    payload: { offerId: string; status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' },
  ) {
    this.assertHrAdmin(ctx);

    const result = await this.db.query<{
      id: string;
      candidate_id: string;
      proposed_title: string;
      salary: number;
      start_date: string;
      notes: string | null;
      status: 'Draft' | 'Sent' | 'Accepted' | 'Declined';
    }>(
      `
      SELECT id, candidate_id, proposed_title, salary, start_date, notes, status
      FROM recruitment_offers
      WHERE id = $1
      LIMIT 1
      `,
      [payload.offerId],
    );

    const offer = result.rows[0];
    if (!offer) {
      throw new NotFoundException('Offer not found.');
    }

    await this.db.query(`UPDATE recruitment_offers SET status = $2, updated_at = NOW() WHERE id = $1`, [offer.id, payload.status]);

    return {
      id: offer.id,
      candidateId: offer.candidate_id,
      proposedTitle: offer.proposed_title,
      salary: Number(offer.salary),
      startDate: offer.start_date,
      notes: offer.notes ?? undefined,
      status: payload.status,
    };
  }

  async listOffers(candidateId?: string) {
    const result = candidateId
      ? await this.db.query<{
          id: string;
          candidate_id: string;
          proposed_title: string;
          salary: number;
          start_date: string;
          notes: string | null;
          status: 'Draft' | 'Sent' | 'Accepted' | 'Declined';
        }>(
          `
          SELECT id, candidate_id, proposed_title, salary, start_date, notes, status
          FROM recruitment_offers
          WHERE candidate_id = $1
          ORDER BY updated_at DESC
          `,
          [candidateId],
        )
      : await this.db.query<{
          id: string;
          candidate_id: string;
          proposed_title: string;
          salary: number;
          start_date: string;
          notes: string | null;
          status: 'Draft' | 'Sent' | 'Accepted' | 'Declined';
        }>(
          `
          SELECT id, candidate_id, proposed_title, salary, start_date, notes, status
          FROM recruitment_offers
          ORDER BY updated_at DESC
          `,
        );

    return result.rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      proposedTitle: row.proposed_title,
      salary: Number(row.salary),
      startDate: row.start_date,
      notes: row.notes ?? undefined,
      status: row.status,
    }));
  }

  async convertCandidateToEmployee(ctx: RecruitmentContext, payload: { candidateId: string }) {
    this.assertHrAdmin(ctx);

    const candidate = await this.ensureCandidate(payload.candidateId);

    const offerResult = await this.db.query<{ proposed_title: string; start_date: string }>(
      `
      SELECT proposed_title, start_date
      FROM recruitment_offers
      WHERE candidate_id = $1 AND status = 'Accepted'
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [candidate.id],
    );

    const offer = offerResult.rows[0];
    if (!offer) {
      throw new BadRequestException('Candidate requires accepted offer before conversion.');
    }

    await this.db.query(`UPDATE recruitment_candidates SET stage = 'Hired' WHERE id = $1`, [candidate.id]);

    return {
      message: 'Candidate converted to employee profile payload.',
      employeeProfileDraft: {
        fullName: candidate.name,
        email: candidate.email,
        roleTitle: offer.proposed_title,
        joinDate: offer.start_date,
      },
    };
  }

  async getFunnel(jobId?: string) {
    const stages: CandidateStage[] = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
    const result = jobId
      ? await this.db.query<{ stage: CandidateStage; count: string }>(
          `
          SELECT stage, COUNT(*)::text AS count
          FROM recruitment_candidates
          WHERE job_id = $1
          GROUP BY stage
          `,
          [jobId],
        )
      : await this.db.query<{ stage: CandidateStage; count: string }>(
          `
          SELECT stage, COUNT(*)::text AS count
          FROM recruitment_candidates
          GROUP BY stage
          `,
        );

    const map = new Map(result.rows.map((row) => [row.stage, Number(row.count)]));
    return stages.map((stage) => ({ stage, count: map.get(stage) ?? 0 }));
  }

  async seedDemoData() {
    const jobCount = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM recruitment_jobs`);
    if (Number(jobCount.rows[0]?.count || '0') === 0) {
      const jobId = this.id('job');
      await this.db.query(
        `
        INSERT INTO recruitment_jobs (id, title, department, location, description, status)
        VALUES ($1, 'Frontend Engineer', 'Engineering', 'Remote', 'Build HR product UI modules', 'open')
        `,
        [jobId],
      );

      await this.db.query(
        `
        INSERT INTO recruitment_candidates (id, name, email, phone, cv_file_name, job_id, stage)
        VALUES ($1, 'Sarah Chen', 'sarah@example.com', '000-000', 'sarah-cv.pdf', $2, 'Applied')
        `,
        [this.id('cand'), jobId],
      );
    }

    const jobs = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM recruitment_jobs`);
    const candidates = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM recruitment_candidates`);

    return {
      message: 'Recruitment demo baseline is ready.',
      jobs: Number(jobs.rows[0]?.count || '0'),
      candidates: Number(candidates.rows[0]?.count || '0'),
    };
  }

  async openPositionsCount() {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM recruitment_jobs WHERE status = 'open'`,
    );
    return Number(result.rows[0]?.count || '0');
  }

  private async ensureCandidate(candidateId: string) {
    const result = await this.db.query<DbCandidate>(
      `SELECT id, name, email, phone, cv_file_name, job_id, stage FROM recruitment_candidates WHERE id = $1 LIMIT 1`,
      [candidateId],
    );
    const candidate = result.rows[0];
    if (!candidate) {
      throw new NotFoundException('Candidate not found.');
    }
    return {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email ?? undefined,
      phone: candidate.phone ?? undefined,
      cvFileName: candidate.cv_file_name ?? undefined,
      jobId: candidate.job_id,
      stage: candidate.stage,
    };
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
