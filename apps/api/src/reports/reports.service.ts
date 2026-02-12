import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  AttendanceSummary,
  HeadcountSummary,
  HiringFunnelSummary,
  LeaveSummary,
  PayrollSummary,
  ReportsRole,
} from './reports.types';
import { DatabaseService } from '../database/database.service';

interface ReportsContext {
  role: ReportsRole;
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  async headcountReport(ctx: ReportsContext): Promise<HeadcountSummary> {
    this.assertManagerOrHr(ctx);

    const totalResult = await this.db.query<{ total_active: string }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'active')::text AS total_active FROM core_employees`,
    );
    const deptResult = await this.db.query<{ department: string; count: string }>(
      `
      SELECT d.name AS department, COUNT(e.id)::text AS count
      FROM core_departments d
      LEFT JOIN core_employees e ON e.department_id = d.id AND e.status = 'active'
      GROUP BY d.name
      ORDER BY d.name ASC
      `,
    );

    return {
      totalActive: Number(totalResult.rows[0]?.total_active || '0'),
      byDepartment: deptResult.rows.map((row) => ({
        department: row.department,
        count: Number(row.count),
      })),
      byLocation: [
        {
          location: 'Unspecified',
          count: Number(totalResult.rows[0]?.total_active || '0'),
        },
      ],
    };
  }

  async attendanceReport(ctx: ReportsContext, range?: { from?: string; to?: string }): Promise<AttendanceSummary[]> {
    this.assertManagerOrHr(ctx);

    const { from, to } = this.resolveRange(range);
    const result = await this.db.query<{ present_days: string; late_count: string; early_leave_count: string }>(
      `
      SELECT COUNT(*) FILTER (WHERE check_in_time IS NOT NULL)::text AS present_days,
             COUNT(*) FILTER (WHERE is_late = TRUE)::text AS late_count,
             COUNT(*) FILTER (WHERE left_early = TRUE)::text AS early_leave_count
      FROM attendance_records
      WHERE date >= $1 AND date <= $2
      `,
      [from, to],
    );

    return [
      {
        from,
        to,
        presentDays: Number(result.rows[0]?.present_days || '0'),
        lateCount: Number(result.rows[0]?.late_count || '0'),
        earlyLeaveCount: Number(result.rows[0]?.early_leave_count || '0'),
      },
    ];
  }

  async leaveReport(ctx: ReportsContext, range?: { from?: string; to?: string }): Promise<LeaveSummary[]> {
    this.assertManagerOrHr(ctx);

    const { from, to } = this.resolveRange(range);

    const approvedDays = await this.db.query<{ leave_type: string; days: string }>(
      `
      SELECT COALESCE(t.name, r.leave_type_id) AS leave_type,
             COALESCE(SUM(r.days), 0)::text AS days
      FROM leave_requests r
      LEFT JOIN leave_types t ON t.id = r.leave_type_id
      WHERE r.status = 'Approved'
        AND r.start_date >= $1
        AND r.end_date <= $2
      GROUP BY leave_type
      ORDER BY leave_type ASC
      `,
      [from, to],
    );

    const requestsByStatus = await this.db.query<{ status: 'Pending' | 'Approved' | 'Rejected'; count: string }>(
      `
      SELECT status, COUNT(*)::text AS count
      FROM leave_requests
      WHERE start_date >= $1 AND end_date <= $2
      GROUP BY status
      `,
      [from, to],
    );

    const statusMap = new Map(requestsByStatus.rows.map((row) => [row.status, Number(row.count)]));

    return [
      {
        from,
        to,
        approvedDaysByType: approvedDays.rows.map((row) => ({
          leaveType: row.leave_type,
          days: Number(row.days),
        })),
        requestsByStatus: [
          { status: 'Pending', count: statusMap.get('Pending') ?? 0 },
          { status: 'Approved', count: statusMap.get('Approved') ?? 0 },
          { status: 'Rejected', count: statusMap.get('Rejected') ?? 0 },
        ],
      },
    ];
  }

  async payrollReport(ctx: ReportsContext, month?: string): Promise<PayrollSummary[]> {
    this.assertHr(ctx);

    const result = month
      ? await this.db.query<{ month: string; total_gross: string; total_deductions: string; total_net: string }>(
          `
          SELECT month,
                 COALESCE(SUM(gross), 0)::text AS total_gross,
                 COALESCE(SUM(deductions), 0)::text AS total_deductions,
                 COALESCE(SUM(net), 0)::text AS total_net
          FROM payroll_entries
          WHERE status = 'Finalized' AND month = $1
          GROUP BY month
          ORDER BY month DESC
          `,
          [month],
        )
      : await this.db.query<{ month: string; total_gross: string; total_deductions: string; total_net: string }>(
          `
          SELECT month,
                 COALESCE(SUM(gross), 0)::text AS total_gross,
                 COALESCE(SUM(deductions), 0)::text AS total_deductions,
                 COALESCE(SUM(net), 0)::text AS total_net
          FROM payroll_entries
          WHERE status = 'Finalized'
          GROUP BY month
          ORDER BY month DESC
          `,
        );

    return result.rows.map((row) => ({
      month: row.month,
      totalGross: Number(row.total_gross),
      totalDeductions: Number(row.total_deductions),
      totalNet: Number(row.total_net),
    }));
  }

  async hiringFunnel(ctx: ReportsContext, jobTitle?: string): Promise<HiringFunnelSummary[]> {
    this.assertManagerOrHr(ctx);

    const rows = jobTitle
      ? await this.db.query<{ job_title: string; stage: string; count: string }>(
          `
          SELECT j.title AS job_title, c.stage, COUNT(*)::text AS count
          FROM recruitment_candidates c
          JOIN recruitment_jobs j ON j.id = c.job_id
          WHERE j.title = $1
          GROUP BY j.title, c.stage
          ORDER BY j.title ASC
          `,
          [jobTitle],
        )
      : await this.db.query<{ job_title: string; stage: string; count: string }>(
          `
          SELECT j.title AS job_title, c.stage, COUNT(*)::text AS count
          FROM recruitment_candidates c
          JOIN recruitment_jobs j ON j.id = c.job_id
          GROUP BY j.title, c.stage
          ORDER BY j.title ASC
          `,
        );

    const stages = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];
    const map = new Map<string, Map<string, number>>();

    for (const row of rows.rows) {
      if (!map.has(row.job_title)) {
        map.set(row.job_title, new Map());
      }
      map.get(row.job_title)?.set(row.stage, Number(row.count));
    }

    return [...map.entries()].map(([title, stageMap]) => ({
      jobTitle: title,
      stages: stages.map((stage) => ({ stage, count: stageMap.get(stage) ?? 0 })),
    }));
  }

  async exportCsv(ctx: ReportsContext, report: 'attendance' | 'leave' | 'payroll' | 'hiring') {
    this.assertManagerOrHr(ctx);
    const header = 'metric,value';

    if (report === 'attendance') {
      const latest = (await this.attendanceReport(ctx))[0];
      return `${header}\npresentDays,${latest.presentDays}\nlateCount,${latest.lateCount}\nearlyLeaveCount,${latest.earlyLeaveCount}`;
    }

    if (report === 'leave') {
      const latest = (await this.leaveReport(ctx))[0];
      const rows = latest.approvedDaysByType.map((r) => `${r.leaveType},${r.days}`).join('\n');
      return `${header}\n${rows}`;
    }

    if (report === 'payroll') {
      this.assertHr(ctx);
      const latest = (await this.payrollReport(ctx))[0] ?? { totalGross: 0, totalDeductions: 0, totalNet: 0 };
      return `${header}\ntotalGross,${latest.totalGross}\ntotalDeductions,${latest.totalDeductions}\ntotalNet,${latest.totalNet}`;
    }

    const latestHiring = (await this.hiringFunnel(ctx))[0];
    const rows = (latestHiring?.stages ?? []).map((r) => `${r.stage},${r.count}`).join('\n');
    return `${header}\n${rows}`;
  }

  private resolveRange(range?: { from?: string; to?: string }) {
    const now = new Date();
    const from = range?.from ?? `${now.toISOString().slice(0, 7)}-01`;
    const to = range?.to ?? now.toISOString().slice(0, 10);
    return { from, to };
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
