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
}
