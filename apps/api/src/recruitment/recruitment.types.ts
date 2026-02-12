export type RecruitmentRole = 'employee' | 'manager' | 'hr_admin';

export type CandidateStage = 'Applied' | 'Screening' | 'Interview' | 'Offer' | 'Hired' | 'Rejected';

export interface JobPosting {
  id: string;
  title: string;
  department: string;
  location: string;
  description: string;
  status: 'open' | 'closed';
}

export interface Candidate {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cvFileName?: string;
  jobId: string;
  stage: CandidateStage;
}

export interface Interview {
  id: string;
  candidateId: string;
  dateTime: string;
  interviewers: string[];
  locationOrLink: string;
  notes?: string;
}

export interface Feedback {
  id: string;
  candidateId: string;
  interviewerId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  strengths: string;
  concerns: string;
  recommendation: 'hire' | 'maybe' | 'no';
}

export interface Offer {
  id: string;
  candidateId: string;
  proposedTitle: string;
  salary: number;
  startDate: string;
  notes?: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined';
}
