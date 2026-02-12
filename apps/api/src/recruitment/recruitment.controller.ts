import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';
import { CandidateStage, RecruitmentRole } from './recruitment.types';

@Controller('recruitment')
export class RecruitmentController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Post('seed-demo')
  seedDemo() {
    return this.recruitmentService.seedDemoData();
  }

  @Post('jobs')
  createJob(
    @Headers() headers: Record<string, string>,
    @Body() body: { title: string; department: string; location: string; description: string; status: 'open' | 'closed' },
  ) {
    return this.recruitmentService.createJob(this.ctx(headers), body);
  }

  @Get('jobs')
  listJobs() {
    return this.recruitmentService.listJobs();
  }

  @Post('candidates')
  createCandidate(
    @Headers() headers: Record<string, string>,
    @Body() body: { name: string; email?: string; phone?: string; cvFileName?: string; jobId: string },
  ) {
    return this.recruitmentService.createCandidate(this.ctx(headers), body);
  }

  @Get('candidates')
  listCandidates(@Query('jobId') jobId?: string) {
    return this.recruitmentService.listCandidates(jobId);
  }

  @Post('candidates/stage')
  moveStage(@Headers() headers: Record<string, string>, @Body() body: { candidateId: string; toStage: CandidateStage }) {
    return this.recruitmentService.moveCandidateStage(this.ctx(headers), body);
  }

  @Post('interviews')
  scheduleInterview(
    @Headers() headers: Record<string, string>,
    @Body() body: { candidateId: string; dateTime: string; interviewers: string[]; locationOrLink: string; notes?: string },
  ) {
    return this.recruitmentService.scheduleInterview(this.ctx(headers), body);
  }

  @Get('interviews')
  interviews(@Query('candidateId') candidateId?: string) {
    return this.recruitmentService.listInterviews(candidateId);
  }

  @Post('feedback')
  feedback(
    @Headers() headers: Record<string, string>,
    @Body() body: { candidateId: string; rating: 1 | 2 | 3 | 4 | 5; strengths: string; concerns: string; recommendation: 'hire' | 'maybe' | 'no' },
  ) {
    return this.recruitmentService.addFeedback(this.ctx(headers), body);
  }

  @Get('feedback')
  listFeedback(@Query('candidateId') candidateId?: string) {
    return this.recruitmentService.listFeedback(candidateId);
  }

  @Post('offers')
  createOffer(
    @Headers() headers: Record<string, string>,
    @Body() body: { candidateId: string; proposedTitle: string; salary: number; startDate: string; notes?: string },
  ) {
    return this.recruitmentService.createOffer(this.ctx(headers), body);
  }

  @Post('offers/status')
  updateOfferStatus(
    @Headers() headers: Record<string, string>,
    @Body() body: { offerId: string; status: 'Draft' | 'Sent' | 'Accepted' | 'Declined' },
  ) {
    return this.recruitmentService.updateOfferStatus(this.ctx(headers), body);
  }

  @Post('convert')
  convert(@Headers() headers: Record<string, string>, @Body() body: { candidateId: string }) {
    return this.recruitmentService.convertCandidateToEmployee(this.ctx(headers), body);
  }

  @Get('funnel')
  funnel(@Query('jobId') jobId?: string) {
    return this.recruitmentService.getFunnel(jobId);
  }

  private ctx(headers: Record<string, string>) {
    return {
      role: (headers['x-role'] || 'employee') as RecruitmentRole,
      employeeId: headers['x-employee-id'],
    };
  }
}
