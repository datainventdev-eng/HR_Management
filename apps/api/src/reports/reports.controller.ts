import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsRole } from './reports.types';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('headcount')
  headcount(@Headers() headers: Record<string, string>) {
    return this.reportsService.headcountReport(this.ctx(headers));
  }

  @Get('attendance')
  attendance(@Headers() headers: Record<string, string>, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.attendanceReport(this.ctx(headers), { from, to });
  }

  @Get('leave')
  leave(@Headers() headers: Record<string, string>, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.leaveReport(this.ctx(headers), { from, to });
  }

  @Get('payroll')
  payroll(@Headers() headers: Record<string, string>, @Query('month') month?: string) {
    return this.reportsService.payrollReport(this.ctx(headers), month);
  }

  @Get('hiring-funnel')
  hiring(@Headers() headers: Record<string, string>, @Query('jobTitle') jobTitle?: string) {
    return this.reportsService.hiringFunnel(this.ctx(headers), jobTitle);
  }

  @Get('export')
  export(@Headers() headers: Record<string, string>, @Query('report') report: 'attendance' | 'leave' | 'payroll' | 'hiring') {
    return {
      report,
      csv: this.reportsService.exportCsv(this.ctx(headers), report),
    };
  }

  private ctx(headers: Record<string, string>) {
    return {
      role: (headers['x-role'] || 'employee') as ReportsRole,
    };
  }
}
