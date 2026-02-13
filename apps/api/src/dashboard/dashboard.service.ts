import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceService } from '../attendance/attendance.service';
import { CoreHrService } from '../core-hr/core-hr.service';
import { DatabaseService } from '../database/database.service';
import { LeaveService } from '../leave/leave.service';
import { OpsService } from '../ops/ops.service';
import { RecruitmentService } from '../recruitment/recruitment.service';
import { TimesheetService } from '../timesheet/timesheet.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly coreHrService: CoreHrService,
    private readonly attendanceService: AttendanceService,
    private readonly leaveService: LeaveService,
    private readonly recruitmentService: RecruitmentService,
    private readonly timesheetService: TimesheetService,
    private readonly opsService: OpsService,
    private readonly db: DatabaseService,
  ) {}

  async overview(ctx: { role: 'employee' | 'manager' | 'hr_admin'; employeeId?: string }) {
    const month = this.resolveMonth();
    const headcount = await this.coreHrService.headcountStats();
    const attendance = await this.attendanceService.todaySummary();
    const onLeave = await this.leaveService.onLeaveCount();
    const openPositions = await this.recruitmentService.openPositionsCount();
    const pendingTimesheets = await this.timesheetService.pendingApprovalsCount(
      ctx.role === 'manager' ? ctx.employeeId : undefined,
    );
    const attendanceTrends = await this.attendanceTrendSummary(attendance.date, headcount.total);

    return {
      greeting: ctx.role === 'employee' ? 'Welcome back' : 'Good Morning',
      role: ctx.role,
      kpis: {
        totalEmployees: headcount.total,
        presentToday: attendance.presentCount,
        onLeave,
        openPositions,
        pendingTimesheets,
      },
      attendance,
      attendanceTrends,
      schedule: [
        { id: 'ev1', title: 'Team Standup', time: '09:00 AM' },
        { id: 'ev2', title: 'Interview Block', time: '02:30 PM' },
      ],
      quickActions: ['Add Employee', 'Process Payroll', 'Schedule Interview', 'Generate Report'],
      recentActivity: await this.opsService.latestActivity(6),
      projectHours: await this.projectHours(month),
    };
  }

  private async attendanceTrendSummary(today: string, totalEmployees: number) {
    const month = today.slice(0, 7);
    const monthStart = `${month}-01`;
    const rows = await this.db.query<{
      date: string;
      present_count: string;
      late_count: string;
      early_leave_count: string;
    }>(
      `
      SELECT
        date::text AS date,
        COUNT(*) FILTER (WHERE check_in_time IS NOT NULL)::text AS present_count,
        COUNT(*) FILTER (WHERE is_late = TRUE)::text AS late_count,
        COUNT(*) FILTER (WHERE left_early = TRUE)::text AS early_leave_count
      FROM attendance_records
      WHERE date >= $1::date
        AND date <= $2::date
      GROUP BY date
      ORDER BY date ASC
      `,
      [monthStart, today],
    );

    const byDate = new Map(
      rows.rows.map((row) => [
        row.date,
        {
          present: Number(row.present_count || '0'),
          late: Number(row.late_count || '0'),
          earlyLeave: Number(row.early_leave_count || '0'),
        },
      ]),
    );

    const workingDays = this.workingDays(monthStart, today);
    const presentSeries: number[] = [];
    const absentSeries: number[] = [];
    const lateSeries: number[] = [];
    const earlyLeaveSeries: number[] = [];
    const onTimeSeries: number[] = [];
    const headcountSeries: number[] = [];

    for (const date of workingDays) {
      const day = byDate.get(date) ?? { present: 0, late: 0, earlyLeave: 0 };
      const absent = Math.max(totalEmployees - day.present, 0);
      const onTime = Math.max(day.present - day.late - day.earlyLeave, 0);
      presentSeries.push(day.present);
      absentSeries.push(absent);
      lateSeries.push(day.late);
      earlyLeaveSeries.push(day.earlyLeave);
      onTimeSeries.push(onTime);
      headcountSeries.push(totalEmployees);
    }

    const previousWorkingDate = this.previousWorkingDay(today);
    const previous = byDate.get(previousWorkingDate) ?? { present: 0, late: 0, earlyLeave: 0 };
    const todayRow = byDate.get(today) ?? { present: 0, late: 0, earlyLeave: 0 };

    return {
      month,
      previousWorkingDate,
      series: {
        headcount: headcountSeries,
        present: presentSeries,
        absent: absentSeries,
        late: lateSeries,
        earlyLeave: earlyLeaveSeries,
        onTime: onTimeSeries,
      },
      deltaPercent: {
        headcount: this.percentageDelta(totalEmployees, totalEmployees),
        present: this.percentageDelta(todayRow.present, previous.present),
        absent: this.percentageDelta(
          Math.max(totalEmployees - todayRow.present, 0),
          Math.max(totalEmployees - previous.present, 0),
        ),
        late: this.percentageDelta(todayRow.late, previous.late),
        earlyLeave: this.percentageDelta(todayRow.earlyLeave, previous.earlyLeave),
        onTime: this.percentageDelta(
          Math.max(todayRow.present - todayRow.late - todayRow.earlyLeave, 0),
          Math.max(previous.present - previous.late - previous.earlyLeave, 0),
        ),
      },
    };
  }

  async projectHours(month?: string) {
    const resolvedMonth = month ? this.resolveMonth(month) : null;
    const weeklyMonthFilter = resolvedMonth ? `WHERE TO_CHAR(week_start_date, 'YYYY-MM') = $1` : '';
    const singleMonthFilter = resolvedMonth ? `WHERE TO_CHAR(start_date, 'YYYY-MM') = $1` : '';
    const result = await this.db.query<{
      project_id: string;
      project_name: string;
      customer_name: string | null;
      total_hours: string;
    }>(
      `
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        c.name AS customer_name,
        (COALESCE(w.weekly_hours, 0) + COALESCE(s.single_hours, 0))::text AS total_hours
      FROM core_projects p
      LEFT JOIN core_customers c ON c.id = p.customer_id
      LEFT JOIN (
        SELECT
          project_id,
          SUM(sun_hours + mon_hours + tue_hours + wed_hours + thu_hours + fri_hours + sat_hours)::numeric AS weekly_hours
        FROM timesheet_weekly_rows
        ${weeklyMonthFilter}
        GROUP BY project_id
      ) w ON w.project_id = p.id
      LEFT JOIN (
        SELECT
          project_id,
          (SUM(duration_minutes)::numeric / 60.0) AS single_hours
        FROM timesheet_single_entries
        ${singleMonthFilter}
        GROUP BY project_id
      ) s ON s.project_id = p.id
      ORDER BY (COALESCE(w.weekly_hours, 0) + COALESCE(s.single_hours, 0)) DESC, p.name ASC
      `,
      resolvedMonth ? [resolvedMonth] : [],
    );

    return result.rows.map((row) => ({
      projectId: row.project_id,
      name: row.project_name,
      customerName: row.customer_name ?? undefined,
      hours: Number(row.total_hours || '0'),
    }));
  }

  async projectEmployeeHours(projectId: string, month?: string) {
    const resolvedMonth = month ? this.resolveMonth(month) : null;
    const projectResult = await this.db.query<{ id: string; name: string }>(
      `SELECT id, name FROM core_projects WHERE id = $1 LIMIT 1`,
      [projectId],
    );
    const project = projectResult.rows[0];
    if (!project) {
      return { projectId, projectName: 'Unknown Project', rows: [] as Array<{ employeeId: string; employeeName: string; hours: number }> };
    }

    const result = await this.db.query<{ employee_id: string; employee_name: string; total_hours: string }>(
      `
      WITH source AS (
        SELECT employee_id, SUM(sun_hours + mon_hours + tue_hours + wed_hours + thu_hours + fri_hours + sat_hours)::numeric AS hours
        FROM timesheet_weekly_rows
        WHERE project_id = $1
          ${resolvedMonth ? "AND TO_CHAR(week_start_date, 'YYYY-MM') = $2" : ''}
        GROUP BY employee_id
        UNION ALL
        SELECT employee_id, (SUM(duration_minutes)::numeric / 60.0) AS hours
        FROM timesheet_single_entries
        WHERE project_id = $1
          ${resolvedMonth ? "AND TO_CHAR(start_date, 'YYYY-MM') = $2" : ''}
        GROUP BY employee_id
      ),
      totals AS (
        SELECT employee_id, SUM(hours)::numeric AS total_hours
        FROM source
        GROUP BY employee_id
      )
      SELECT
        t.employee_id,
        COALESCE(e.full_name, u.full_name, t.employee_id) AS employee_name,
        t.total_hours::text AS total_hours
      FROM totals t
      LEFT JOIN core_employees e ON e.id = t.employee_id
      LEFT JOIN app_users u ON u.employee_id = t.employee_id
      ORDER BY t.total_hours DESC, employee_name ASC
      `,
      resolvedMonth ? [projectId, resolvedMonth] : [projectId],
    );

    return {
      projectId: project.id,
      projectName: project.name,
      rows: result.rows.map((row) => ({
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        hours: Number(row.total_hours || '0'),
      })),
    };
  }

  private resolveMonth(month?: string) {
    const fallback = new Date().toISOString().slice(0, 7);
    if (!month) return fallback;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('month must be in YYYY-MM format.');
    }
    return month;
  }

  private workingDays(fromDate: string, toDate: string) {
    const result: string[] = [];
    const cursor = new Date(`${fromDate}T00:00:00Z`);
    const end = new Date(`${toDate}T00:00:00Z`);

    while (cursor <= end) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) {
        result.push(cursor.toISOString().slice(0, 10));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return result;
  }

  private previousWorkingDay(date: string) {
    const cursor = new Date(`${date}T00:00:00Z`);
    do {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
    return cursor.toISOString().slice(0, 10);
  }

  private percentageDelta(current: number, previous: number) {
    if (previous === 0) {
      return current === 0 ? 0 : 100;
    }
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }
}
