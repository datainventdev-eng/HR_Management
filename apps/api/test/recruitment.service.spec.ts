import { RecruitmentService } from '../src/recruitment/recruitment.service';

describe('RecruitmentService', () => {
  it('blocks moving a final-stage candidate', () => {
    const service = new RecruitmentService();
    const admin = { role: 'hr_admin' as const, employeeId: 'hr1' };

    const job = service.createJob(admin, {
      title: 'Engineer',
      department: 'Engineering',
      location: 'Remote',
      description: 'Desc',
      status: 'open',
    });

    const candidate = service.createCandidate(admin, { name: 'A', jobId: job.id });
    service.moveCandidateStage(admin, { candidateId: candidate.id, toStage: 'Rejected' });

    expect(() => service.moveCandidateStage(admin, { candidateId: candidate.id, toStage: 'Screening' })).toThrow(
      'Final-stage',
    );
  });

  it('requires accepted offer before conversion', () => {
    const service = new RecruitmentService();
    const admin = { role: 'hr_admin' as const, employeeId: 'hr1' };

    const job = service.createJob(admin, {
      title: 'Engineer',
      department: 'Engineering',
      location: 'Remote',
      description: 'Desc',
      status: 'open',
    });

    const candidate = service.createCandidate(admin, { name: 'B', jobId: job.id });

    service.createOffer(admin, {
      candidateId: candidate.id,
      proposedTitle: 'Engineer',
      salary: 2000,
      startDate: '2026-03-01',
    });

    expect(() => service.convertCandidateToEmployee(admin, { candidateId: candidate.id })).toThrow('accepted offer');
  });
});
