import { BadRequestException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { EmployeeManagerMap, Timesheet, TimesheetEntry, TimesheetRole, TimesheetStatus } from './timesheet.types';
import { OpsService } from '../ops/ops.service';
import { DatabaseService } from '../database/database.service';

interface TimesheetContext {
  role: TimesheetRole;
  employeeId?: string;
}

interface DbTimesheet {
  id: string;
  employee_id: string;
  manager_id: string;
  week_start_date: string;
  total_hours: number;
  status: TimesheetStatus;
  manager_comment: string | null;
}

interface DbCatalogCustomer {
  id: string;
  name: string;
}

interface DbCatalogProject {
  id: string;
  customer_id: string | null;
  name: string;
}

interface DbSingleEntry {
  id: string;
  employee_id: string;
  customer_id: string;
  project_id: string;
  billable: boolean;
  start_date: string;
  duration_minutes: number;
  notes: string | null;
}

interface DbWeeklyRow {
  id: string;
  employee_id: string;
  week_start_date: string;
  customer_id: string;
  project_id: string;
  billable: boolean;
  notes: string | null;
  sun_hours: number;
  mon_hours: number;
  tue_hours: number;
  wed_hours: number;
  thu_hours: number;
  fri_hours: number;
  sat_hours: number;
}

@Injectable()
export class TimesheetService implements OnModuleInit {
  constructor(
    private readonly opsService: OpsService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS timesheet_manager_map (
        employee_id TEXT PRIMARY KEY,
        manager_id TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS timesheets (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        manager_id TEXT NOT NULL,
        week_start_date DATE NOT NULL,
        total_hours NUMERIC(6,2) NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('Draft','Submitted','Approved','Rejected')),
        manager_comment TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_timesheet_week UNIQUE (employee_id, week_start_date)
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS timesheet_entries (
        id TEXT PRIMARY KEY,
        timesheet_id TEXT NOT NULL,
        day TEXT NOT NULL,
        hours NUMERIC(5,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_timesheet_entries_timesheet FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE CASCADE
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS timesheet_history (
        id TEXT PRIMARY KEY,
        timesheet_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('Draft','Submitted','Approved','Rejected')),
        at TIMESTAMPTZ NOT NULL,
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_timesheet_history_timesheet FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE CASCADE
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS timesheet_single_entries (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        billable BOOLEAN NOT NULL DEFAULT TRUE,
        start_date DATE NOT NULL,
        duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS timesheet_weekly_rows (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        week_start_date DATE NOT NULL,
        customer_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        billable BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        sun_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        mon_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        tue_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        wed_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        thu_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        fri_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        sat_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async catalog(ctx: TimesheetContext) {
    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }

    const [customers, projects] = await Promise.all([
      this.db.query<DbCatalogCustomer>(`SELECT id, name FROM core_customers ORDER BY name ASC`),
      this.db.query<DbCatalogProject>(`SELECT id, customer_id, name FROM core_projects ORDER BY name ASC`),
    ]);

    return {
      customers: customers.rows.map((row) => ({ id: row.id, name: row.name })),
      projects: projects.rows.map((row) => ({ id: row.id, customerId: row.customer_id ?? '', name: row.name })),
    };
  }

  async summary(ctx: TimesheetContext, payload?: { employeeId?: string; weekStartDate?: string }) {
    const employeeId = this.resolveEmployeeId(ctx, payload?.employeeId);
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const weekStartDate = payload?.weekStartDate ?? this.startOfWeek(now);

    const weeklyRows = await this.db.query<{ total: string }>(
      `
      SELECT COALESCE(SUM(
          sun_hours + mon_hours + tue_hours + wed_hours + thu_hours + fri_hours + sat_hours
      ), 0)::text AS total
      FROM timesheet_weekly_rows
      WHERE employee_id = $1 AND week_start_date = $2
      `,
      [employeeId, weekStartDate],
    );

    const weeklySingle = await this.db.query<{ total: string }>(
      `
      SELECT COALESCE(SUM(duration_minutes), 0)::text AS total
      FROM timesheet_single_entries
      WHERE employee_id = $1
        AND start_date >= $2::date
        AND start_date < ($2::date + INTERVAL '7 day')
      `,
      [employeeId, weekStartDate],
    );

    const monthlyRows = await this.db.query<{ total: string }>(
      `
      SELECT COALESCE(SUM(
          sun_hours + mon_hours + tue_hours + wed_hours + thu_hours + fri_hours + sat_hours
      ), 0)::text AS total
      FROM timesheet_weekly_rows
      WHERE employee_id = $1
        AND TO_CHAR(week_start_date, 'YYYY-MM') = $2
      `,
      [employeeId, month],
    );

    const monthlySingle = await this.db.query<{ total: string }>(
      `
      SELECT COALESCE(SUM(duration_minutes), 0)::text AS total
      FROM timesheet_single_entries
      WHERE employee_id = $1
        AND TO_CHAR(start_date, 'YYYY-MM') = $2
      `,
      [employeeId, month],
    );

    const weekHours = Number(weeklyRows.rows[0]?.total || '0') + Number(weeklySingle.rows[0]?.total || '0') / 60;
    const monthHours = Number(monthlyRows.rows[0]?.total || '0') + Number(monthlySingle.rows[0]?.total || '0') / 60;

    return {
      weekStartDate,
      weekEndDate: this.shiftDate(weekStartDate, 6),
      thisWeekTotal: this.hoursToHhMm(weekHours),
      thisMonthTotal: this.hoursToHhMm(monthHours),
      monthLabel: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }

  async saveSingleEntry(
    ctx: TimesheetContext,
    payload: { customerId: string; projectId: string; billable: boolean; startDate: string; duration: string; notes?: string },
  ) {
    const employeeId = this.resolveEmployeeId(ctx);
    await this.ensureCustomerProjectRelation(payload.customerId, payload.projectId);
    const durationMinutes = this.parseDuration(payload.duration);

    const entryId = this.id('tsse');
    await this.db.query(
      `
      INSERT INTO timesheet_single_entries
      (id, employee_id, customer_id, project_id, billable, start_date, duration_minutes, notes, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      `,
      [entryId, employeeId, payload.customerId, payload.projectId, payload.billable, payload.startDate, durationMinutes, payload.notes ?? null],
    );

    return { id: entryId, success: true };
  }

  async listSingleEntries(ctx: TimesheetContext, payload?: { date?: string; employeeId?: string }) {
    const employeeId = this.resolveEmployeeId(ctx, payload?.employeeId);
    const date = payload?.date ?? this.today();
    const result = await this.db.query<DbSingleEntry>(
      `
      SELECT id, employee_id, customer_id, project_id, billable, start_date, duration_minutes, notes
      FROM timesheet_single_entries
      WHERE employee_id = $1 AND start_date = $2
      ORDER BY created_at DESC
      `,
      [employeeId, date],
    );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      customerId: row.customer_id,
      projectId: row.project_id,
      billable: row.billable,
      startDate: row.start_date,
      duration: this.minutesToDuration(row.duration_minutes),
      notes: row.notes ?? '',
    }));
  }

  async saveWeeklyRows(
    ctx: TimesheetContext,
    payload: {
      weekStartDate: string;
      rows: Array<{
        customerId: string;
        projectId: string;
        billable: boolean;
        notes?: string;
        hours: { sun: number; mon: number; tue: number; wed: number; thu: number; fri: number; sat: number };
      }>;
    },
  ) {
    const employeeId = this.resolveEmployeeId(ctx);
    if (!payload.rows?.length) {
      throw new BadRequestException('At least one weekly row is required.');
    }

    await this.db.transaction(async (query) => {
      await query(`DELETE FROM timesheet_weekly_rows WHERE employee_id = $1 AND week_start_date = $2`, [employeeId, payload.weekStartDate]);

      for (const row of payload.rows) {
        await this.ensureCustomerProjectRelation(row.customerId, row.projectId);
        const values = [row.hours.sun, row.hours.mon, row.hours.tue, row.hours.wed, row.hours.thu, row.hours.fri, row.hours.sat];
        if (values.some((hour) => hour < 0 || hour > 24)) {
          throw new BadRequestException('Weekly hours must be between 0 and 24.');
        }

        await query(
          `
          INSERT INTO timesheet_weekly_rows
          (id, employee_id, week_start_date, customer_id, project_id, billable, notes, sun_hours, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
          `,
          [
            this.id('tswr'),
            employeeId,
            payload.weekStartDate,
            row.customerId,
            row.projectId,
            row.billable,
            row.notes ?? null,
            row.hours.sun,
            row.hours.mon,
            row.hours.tue,
            row.hours.wed,
            row.hours.thu,
            row.hours.fri,
            row.hours.sat,
          ],
        );
      }
    });

    return this.listWeeklyRows(ctx, { weekStartDate: payload.weekStartDate, employeeId });
  }

  async listWeeklyRows(ctx: TimesheetContext, payload?: { weekStartDate?: string; employeeId?: string }) {
    const employeeId = this.resolveEmployeeId(ctx, payload?.employeeId);
    const weekStartDate = payload?.weekStartDate ?? this.startOfWeek(new Date());
    const result = await this.db.query<DbWeeklyRow>(
      `
      SELECT id, employee_id, week_start_date, customer_id, project_id, billable, notes,
             sun_hours, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours
      FROM timesheet_weekly_rows
      WHERE employee_id = $1 AND week_start_date = $2
      ORDER BY created_at ASC
      `,
      [employeeId, weekStartDate],
    );

    const rows = result.rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      projectId: row.project_id,
      billable: row.billable,
      notes: row.notes ?? '',
      hours: {
        sun: Number(row.sun_hours),
        mon: Number(row.mon_hours),
        tue: Number(row.tue_hours),
        wed: Number(row.wed_hours),
        thu: Number(row.thu_hours),
        fri: Number(row.fri_hours),
        sat: Number(row.sat_hours),
      },
    }));

    const totals = rows.reduce(
      (acc, row) => {
        acc.sun += row.hours.sun;
        acc.mon += row.hours.mon;
        acc.tue += row.hours.tue;
        acc.wed += row.hours.wed;
        acc.thu += row.hours.thu;
        acc.fri += row.hours.fri;
        acc.sat += row.hours.sat;
        return acc;
      },
      { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 },
    );

    return {
      weekStartDate,
      rows,
      totals: { ...totals, total: totals.sun + totals.mon + totals.tue + totals.wed + totals.thu + totals.fri + totals.sat },
    };
  }

  async setManagerMap(ctx: TimesheetContext, payload: EmployeeManagerMap) {
    this.assertHrOrManager(ctx);
    await this.db.query(
      `
      INSERT INTO timesheet_manager_map (employee_id, manager_id, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (employee_id)
      DO UPDATE SET manager_id = EXCLUDED.manager_id, updated_at = NOW()
      `,
      [payload.employeeId, payload.managerId],
    );

    return payload;
  }

  async submitTimesheet(
    ctx: TimesheetContext,
    payload: {
      weekStartDate: string;
      entries: TimesheetEntry[];
    },
  ) {
    if (ctx.role !== 'employee') {
      throw new UnauthorizedException('Only employees can submit timesheets.');
    }

    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }

    if (!payload.entries?.length) {
      throw new BadRequestException('At least one day entry is required.');
    }

    const invalidEntry = payload.entries.find((entry) => entry.hours < 0 || entry.hours > 24);
    if (invalidEntry) {
      throw new BadRequestException('Timesheet hours must be between 0 and 24.');
    }

    const mappingResult = await this.db.query<{ manager_id: string }>(
      `SELECT manager_id FROM timesheet_manager_map WHERE employee_id = $1 LIMIT 1`,
      [ctx.employeeId],
    );
    const mapping = mappingResult.rows[0];
    if (!mapping) {
      throw new BadRequestException('Manager assignment is required before submitting timesheet.');
    }

    const existingResult = await this.db.query<DbTimesheet>(
      `SELECT * FROM timesheets WHERE employee_id = $1 AND week_start_date = $2 LIMIT 1`,
      [ctx.employeeId, payload.weekStartDate],
    );
    const existing = existingResult.rows[0];

    if (existing && existing.status === 'Approved') {
      throw new BadRequestException('Approved timesheet cannot be edited.');
    }

    const totalHours = payload.entries.reduce((sum, entry) => sum + entry.hours, 0);

    if (existing) {
      await this.db.transaction(async (query) => {
        await query(
          `
          UPDATE timesheets
          SET total_hours = $2,
              status = 'Submitted',
              manager_id = $3,
              manager_comment = NULL,
              updated_at = NOW()
          WHERE id = $1
          `,
          [existing.id, totalHours, mapping.manager_id],
        );

        await query(`DELETE FROM timesheet_entries WHERE timesheet_id = $1`, [existing.id]);
        for (const entry of payload.entries) {
          await query(`INSERT INTO timesheet_entries (id, timesheet_id, day, hours) VALUES ($1, $2, $3, $4)`, [
            this.id('tse'),
            existing.id,
            entry.day,
            entry.hours,
          ]);
        }

        await query(`INSERT INTO timesheet_history (id, timesheet_id, status, at, comment) VALUES ($1, $2, $3, NOW(), $4)`, [
          this.id('tsh'),
          existing.id,
          'Submitted',
          null,
        ]);
      });

      await this.opsService.addNotification({
        userId: mapping.manager_id,
        type: 'timesheet',
        title: 'Timesheet resubmitted',
        message: `Employee ${ctx.employeeId} resubmitted weekly timesheet ${existing.id}.`,
      });
      await this.opsService.addAudit({
        actorId: ctx.employeeId,
        action: 'timesheet.submitted',
        entity: 'timesheet',
        entityId: existing.id,
        metadata: { weekStartDate: payload.weekStartDate, totalHours },
      });

      return this.getTimesheetById(existing.id);
    }

    const timesheetId = this.id('ts');

    await this.db.transaction(async (query) => {
      await query(
        `
        INSERT INTO timesheets (id, employee_id, manager_id, week_start_date, total_hours, status, manager_comment, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'Submitted', NULL, NOW())
        `,
        [timesheetId, ctx.employeeId, mapping.manager_id, payload.weekStartDate, totalHours],
      );

      for (const entry of payload.entries) {
        await query(`INSERT INTO timesheet_entries (id, timesheet_id, day, hours) VALUES ($1, $2, $3, $4)`, [
          this.id('tse'),
          timesheetId,
          entry.day,
          entry.hours,
        ]);
      }

      await query(`INSERT INTO timesheet_history (id, timesheet_id, status, at, comment) VALUES ($1, $2, $3, NOW(), $4)`, [
        this.id('tsh'),
        timesheetId,
        'Submitted',
        null,
      ]);
    });

    await this.opsService.addNotification({
      userId: mapping.manager_id,
      type: 'timesheet',
      title: 'New timesheet submitted',
      message: `Employee ${ctx.employeeId} submitted timesheet ${timesheetId}.`,
    });
    await this.opsService.addAudit({
      actorId: ctx.employeeId,
      action: 'timesheet.submitted',
      entity: 'timesheet',
      entityId: timesheetId,
      metadata: { weekStartDate: payload.weekStartDate, totalHours },
    });

    return this.getTimesheetById(timesheetId);
  }

  async listTimesheets(ctx: TimesheetContext, query?: { employeeId?: string; weekStartDate?: string }) {
    const params: unknown[] = [];
    const where: string[] = [];

    if (ctx.role === 'employee') {
      where.push(`employee_id = $${params.push(ctx.employeeId ?? '')}`);
    }

    if (ctx.role === 'manager') {
      where.push(`manager_id = $${params.push(ctx.employeeId ?? '')}`);
    }

    if (ctx.role === 'hr_admin' && query?.employeeId) {
      where.push(`employee_id = $${params.push(query.employeeId)}`);
    }

    if (query?.weekStartDate) {
      where.push(`week_start_date = $${params.push(query.weekStartDate)}`);
    }

    const sql = `
      SELECT *
      FROM timesheets
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY week_start_date DESC
    `;

    const result = await this.db.query<DbTimesheet>(sql, params);
    return Promise.all(result.rows.map((row) => this.getTimesheetById(row.id)));
  }

  async report(
    ctx: TimesheetContext,
    payload: { from: string; to: string; groupBy?: 'none' | 'customer' | 'project'; employeeId?: string },
  ) {
    const employeeId = this.resolveEmployeeId(ctx, payload.employeeId);
    const from = payload.from;
    const to = payload.to;
    if (!from || !to) {
      throw new BadRequestException('from and to dates are required.');
    }
    if (to < from) {
      throw new BadRequestException('Invalid date range.');
    }

    const groupBy = payload.groupBy ?? 'none';
    if (!['none', 'customer', 'project'].includes(groupBy)) {
      throw new BadRequestException('groupBy must be one of: none, customer, project.');
    }

    const result = await this.db.query<{
      activity_date: string;
      customer_id: string;
      customer_name: string | null;
      project_id: string;
      project_name: string | null;
      notes: string | null;
      billable: boolean;
      duration_minutes: string;
    }>(
      `
      WITH single_rows AS (
        SELECT
          s.start_date AS activity_date,
          s.customer_id,
          s.project_id,
          s.notes,
          s.billable,
          s.duration_minutes::int AS duration_minutes
        FROM timesheet_single_entries s
        WHERE s.employee_id = $1
          AND s.start_date >= $2::date
          AND s.start_date <= $3::date
      ),
      weekly_rows AS (
        SELECT
          (w.week_start_date + v.day_offset)::date AS activity_date,
          w.customer_id,
          w.project_id,
          w.notes,
          w.billable,
          (v.hours * 60)::int AS duration_minutes
        FROM timesheet_weekly_rows w
        JOIN LATERAL (
          VALUES
            (0, w.sun_hours),
            (1, w.mon_hours),
            (2, w.tue_hours),
            (3, w.wed_hours),
            (4, w.thu_hours),
            (5, w.fri_hours),
            (6, w.sat_hours)
        ) AS v(day_offset, hours) ON TRUE
        WHERE w.employee_id = $1
          AND (w.week_start_date + v.day_offset) >= $2::date
          AND (w.week_start_date + v.day_offset) <= $3::date
          AND v.hours > 0
      ),
      merged AS (
        SELECT * FROM single_rows
        UNION ALL
        SELECT * FROM weekly_rows
      )
      SELECT
        m.activity_date::text AS activity_date,
        m.customer_id,
        c.name AS customer_name,
        m.project_id,
        p.name AS project_name,
        m.notes,
        m.billable,
        m.duration_minutes::text AS duration_minutes
      FROM merged m
      LEFT JOIN core_customers c ON c.id = m.customer_id
      LEFT JOIN core_projects p ON p.id = m.project_id
      ORDER BY m.activity_date ASC, c.name ASC NULLS LAST, p.name ASC NULLS LAST
      `,
      [employeeId, from, to],
    );

    const rows = result.rows.map((row) => {
      const minutes = Number(row.duration_minutes || '0');
      const duration = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
      return {
        activityDate: row.activity_date,
        customerId: row.customer_id,
        customerName: row.customer_name ?? 'Unknown Customer',
        projectId: row.project_id,
        projectName: row.project_name ?? 'Unknown Project',
        notes: row.notes ?? '',
        billable: row.billable,
        durationMinutes: minutes,
        duration,
      };
    });

    return {
      employeeId,
      from,
      to,
      groupBy,
      rows,
      totalMinutes: rows.reduce((sum, row) => sum + row.durationMinutes, 0),
    };
  }

  async decideTimesheet(
    ctx: TimesheetContext,
    payload: {
      timesheetId: string;
      decision: 'Approved' | 'Rejected';
      managerComment?: string;
    },
  ) {
    if (ctx.role !== 'manager') {
      throw new UnauthorizedException('Only managers can approve or reject timesheets.');
    }

    const result = await this.db.query<DbTimesheet>(`SELECT * FROM timesheets WHERE id = $1 LIMIT 1`, [payload.timesheetId]);
    const timesheet = result.rows[0];
    if (!timesheet) {
      throw new NotFoundException('Timesheet not found.');
    }

    if (timesheet.manager_id !== ctx.employeeId) {
      throw new UnauthorizedException('Managers can only decide direct-report timesheets.');
    }

    if (timesheet.status !== 'Submitted') {
      throw new BadRequestException('Only submitted timesheets can be updated.');
    }

    await this.db.transaction(async (query) => {
      await query(
        `
        UPDATE timesheets
        SET status = $2,
            manager_comment = $3,
            updated_at = NOW()
        WHERE id = $1
        `,
        [timesheet.id, payload.decision, payload.managerComment ?? null],
      );

      await query(`INSERT INTO timesheet_history (id, timesheet_id, status, at, comment) VALUES ($1, $2, $3, NOW(), $4)`, [
        this.id('tsh'),
        timesheet.id,
        payload.decision,
        payload.managerComment ?? null,
      ]);
    });

    await this.opsService.addNotification({
      userId: timesheet.employee_id,
      type: 'timesheet',
      title: `Timesheet ${payload.decision.toLowerCase()}`,
      message: `Your timesheet ${timesheet.id} was ${payload.decision.toLowerCase()}.`,
    });
    await this.opsService.addAudit({
      actorId: ctx.employeeId || 'manager',
      action: `timesheet.${payload.decision.toLowerCase()}`,
      entity: 'timesheet',
      entityId: timesheet.id,
      metadata: { managerComment: payload.managerComment || '' },
    });

    return this.getTimesheetById(timesheet.id);
  }

  async seedDemoData() {
    await this.db.query(
      `
      INSERT INTO timesheet_manager_map (employee_id, manager_id, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (employee_id)
      DO UPDATE SET manager_id = EXCLUDED.manager_id, updated_at = NOW()
      `,
      ['emp_demo_1', 'mgr_demo_1'],
    );

    const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM timesheet_manager_map`);

    return {
      message: 'Timesheet demo baseline is ready.',
      mappingCount: Number(count.rows[0]?.count || '0'),
    };
  }

  async pendingApprovalsCount(managerId?: string) {
    const result = managerId
      ? await this.db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM timesheets WHERE manager_id = $1 AND status = 'Submitted'`,
          [managerId],
        )
      : await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM timesheets WHERE status = 'Submitted'`);

    return Number(result.rows[0]?.count || '0');
  }

  private assertHrOrManager(ctx: TimesheetContext) {
    if (ctx.role !== 'hr_admin' && ctx.role !== 'manager') {
      throw new UnauthorizedException('Only HR Admin or Manager can perform this action.');
    }
  }

  private resolveEmployeeId(ctx: TimesheetContext, requestedEmployeeId?: string) {
    if (ctx.role === 'employee') {
      if (!ctx.employeeId) throw new UnauthorizedException('Employee context is missing.');
      return ctx.employeeId;
    }

    if (requestedEmployeeId) return requestedEmployeeId;
    if (ctx.employeeId) return ctx.employeeId;
    throw new BadRequestException('Employee ID is required.');
  }

  private async ensureCustomerProjectRelation(customerId: string, projectId: string) {
    if (!customerId?.trim() || !projectId?.trim()) {
      throw new BadRequestException('Customer and service are required.');
    }
    const project = await this.db.query<{ id: string; customer_id: string | null }>(
      `SELECT id, customer_id FROM core_projects WHERE id = $1 LIMIT 1`,
      [projectId],
    );
    const row = project.rows[0];
    if (!row) {
      throw new BadRequestException('Selected service/project does not exist.');
    }
    if ((row.customer_id ?? '') !== customerId) {
      throw new BadRequestException('Selected service does not belong to selected customer.');
    }
  }

  private parseDuration(input: string) {
    const trimmed = input.trim();
    let total = 0;

    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length !== 2) {
        throw new BadRequestException('Duration format is invalid. Use 4, 4.5, or 4:20.');
      }
      const hours = Number(parts[0]);
      const minutes = Number(parts[1]);
      if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || minutes < 0 || minutes > 59) {
        throw new BadRequestException('Duration format is invalid. Use 4, 4.5, or 4:20.');
      }
      total = hours * 60 + minutes;
    } else {
      const numeric = Number(trimmed);
      if (Number.isNaN(numeric) || numeric <= 0) {
        throw new BadRequestException('Duration format is invalid. Use 4, 4.5, or 4:20.');
      }
      total = Math.round(numeric * 60);
    }

    if (total <= 0) {
      throw new BadRequestException('Duration must be greater than 00:00.');
    }
    return total;
  }

  private minutesToDuration(totalMinutes: number) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private hoursToHhMm(hours: number) {
    const totalMinutes = Math.round(hours * 60);
    return this.minutesToDuration(totalMinutes);
  }

  private async getTimesheetById(id: string): Promise<Timesheet> {
    const timesheetResult = await this.db.query<DbTimesheet>(`SELECT * FROM timesheets WHERE id = $1 LIMIT 1`, [id]);
    const sheet = timesheetResult.rows[0];
    if (!sheet) {
      throw new NotFoundException('Timesheet not found.');
    }

    const entriesResult = await this.db.query<{ day: string; hours: number }>(
      `SELECT day, hours FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY day ASC`,
      [id],
    );

    const historyResult = await this.db.query<{ status: TimesheetStatus; at: string; comment: string | null }>(
      `SELECT status, at::text AS at, comment FROM timesheet_history WHERE timesheet_id = $1 ORDER BY at ASC`,
      [id],
    );

    return {
      id: sheet.id,
      employeeId: sheet.employee_id,
      managerId: sheet.manager_id,
      weekStartDate: sheet.week_start_date,
      entries: entriesResult.rows.map((entry) => ({ day: entry.day, hours: Number(entry.hours) })),
      totalHours: Number(sheet.total_hours),
      status: sheet.status,
      managerComment: sheet.manager_comment ?? undefined,
      history: historyResult.rows.map((item) => ({
        status: item.status,
        at: item.at,
        comment: item.comment ?? undefined,
      })),
    };
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private startOfWeek(date: Date) {
    const d = new Date(date);
    const day = d.getDay(); // Sun=0
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  }

  private shiftDate(dateIso: string, days: number) {
    const d = new Date(`${dateIso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
