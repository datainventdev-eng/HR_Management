import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  AttendanceSummary,
  HeadcountSummary,
  HiringFunnelSummary,
  LeaveSummary,
  PayrollSummary,
  ReportsRole,
} from './reports.types';

interface ReportsContext {
  role: ReportsRole;
}

@Injectable()
export class ReportsService {
  private readonly headcount: HeadcountSummary = {
    totalActive: 128,
    byDepartment: [
      { department: 'Engineering', count: 52 },
      { department: 'HR', count: 10 },
      { department: 'Finance', count: 16 },
      { department: 'Sales', count: 50 },
    ],
    byLocation: [
      { location: 'Lahore', count: 80 },
      { location: 'Karachi', count: 30 },
      { location: 'Remote', count: 18 },
    ],
  };

  private readonly attendanceSamples: AttendanceSummary[] = [
    { from: '2026-02-01', to: '2026-02-28', presentDays: 2260, lateCount: 54, earlyLeaveCount: 31 },
    { from: '2026-01-01', to: '2026-01-31', presentDays: 2198, lateCount: 61, earlyLeaveCount: 40 },
  ];

  private readonly leaveSamples: LeaveSummary[] = [
    {
      from: '2026-02-01',
      to: '2026-02-28',
      approvedDaysByType: [
        { leaveType: 'Annual Leave', days: 32 },
        { leaveType: 'Sick Leave', days: 11 },
      ],
      requestsByStatus: [
        { status: 'Pending', count: 4 },
        { status: 'Approved', count: 23 },
        { status: 'Rejected', count: 3 },
      ],
    },
  ];

  private readonly payrollSamples: PayrollSummary[] = [
    { month: '2026-02', totalGross: 320000, totalDeductions: 42000, totalNet: 278000 },
    { month: '2026-01', totalGross: 315000, totalDeductions: 41000, totalNet: 274000 },
  ];

  private readonly hiringSamples: HiringFunnelSummary[] = [
    {
      jobTitle: 'Frontend Engineer',
      stages: [
        { stage: 'Applied', count: 42 },
        { stage: 'Screening', count: 16 },
        { stage: 'Interview', count: 8 },
        { stage: 'Offer', count: 3 },
        { stage: 'Hired', count: 2 },
        { stage: 'Rejected', count: 13 },
      ],
    },
  ];

  headcountReport(ctx: ReportsContext) {
    this.assertManagerOrHr(ctx);
    return this.headcount;
  }

  attendanceReport(ctx: ReportsContext, range?: { from?: string; to?: string }) {
    this.assertManagerOrHr(ctx);
    return this.pickByRange(this.attendanceSamples, range);
  }

  leaveReport(ctx: ReportsContext, range?: { from?: string; to?: string }) {
    this.assertManagerOrHr(ctx);
    return this.pickByRange(this.leaveSamples, range);
  }

  payrollReport(ctx: ReportsContext, month?: string) {
    this.assertHr(ctx);
    if (!month) return this.payrollSamples;
    return this.payrollSamples.filter((row) => row.month === month);
  }

  hiringFunnel(ctx: ReportsContext, jobTitle?: string) {
    this.assertManagerOrHr(ctx);
    if (!jobTitle) return this.hiringSamples;
    return this.hiringSamples.filter((row) => row.jobTitle === jobTitle);
  }

  exportCsv(ctx: ReportsContext, report: 'attendance' | 'leave' | 'payroll' | 'hiring') {
    this.assertManagerOrHr(ctx);
    const header = 'metric,value';
    if (report === 'attendance') {
      const latest = this.attendanceSamples[0];
      return `${header}\npresentDays,${latest.presentDays}\nlateCount,${latest.lateCount}\nearlyLeaveCount,${latest.earlyLeaveCount}`;
    }

    if (report === 'leave') {
      const latest = this.leaveSamples[0];
      const rows = latest.approvedDaysByType.map((r) => `${r.leaveType},${r.days}`).join('\n');
      return `${header}\n${rows}`;
    }

    if (report === 'payroll') {
      this.assertHr(ctx);
      const latest = this.payrollSamples[0];
      return `${header}\ntotalGross,${latest.totalGross}\ntotalDeductions,${latest.totalDeductions}\ntotalNet,${latest.totalNet}`;
    }

    const latestHiring = this.hiringSamples[0];
    const rows = latestHiring.stages.map((r) => `${r.stage},${r.count}`).join('\n');
    return `${header}\n${rows}`;
  }

  private pickByRange<T extends { from: string; to: string }>(list: T[], range?: { from?: string; to?: string }) {
    if (!range?.from && !range?.to) {
      return list;
    }

    return list.filter((item) => {
      const fromOk = range?.from ? item.from >= range.from : true;
      const toOk = range?.to ? item.to <= range.to : true;
      return fromOk && toOk;
    });
  }

  private assertManagerOrHr(ctx: ReportsContext) {
    if (ctx.role !== 'manager' && ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only manager or HR Admin can view this report.');
    }
  }

  private assertHr(ctx: ReportsContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can view payroll report.');
    }
  }
}
