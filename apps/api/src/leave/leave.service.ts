import { BadRequestException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { EmployeeManagerMap, LeaveAllocation, LeaveRequest, LeaveRole, LeaveType } from './leave.types';
import { OpsService } from '../ops/ops.service';
import { DatabaseService } from '../database/database.service';

interface LeaveContext {
  role: LeaveRole;
  employeeId?: string;
}

@Injectable()
export class LeaveService implements OnModuleInit {
  constructor(
    private readonly opsService: OpsService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS leave_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        paid BOOLEAN NOT NULL,
        annual_limit INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS leave_manager_map (
        employee_id TEXT PRIMARY KEY,
        manager_id TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS leave_allocations (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        leave_type_id TEXT NOT NULL,
        allocated INTEGER NOT NULL CHECK (allocated >= 0),
        used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_leave_allocation UNIQUE (employee_id, leave_type_id),
        CONSTRAINT fk_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        manager_id TEXT NOT NULL,
        leave_type_id TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT,
        days INTEGER NOT NULL CHECK (days > 0),
        status TEXT NOT NULL CHECK (status IN ('Pending','Approved','Rejected')),
        manager_comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_leave_request_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
      );
    `);
  }

  async createLeaveType(ctx: LeaveContext, payload: { name: string; paid: boolean; annualLimit?: number }) {
    this.assertHrAdmin(ctx);
    if (!payload.name?.trim()) {
      throw new BadRequestException('Leave type name is required.');
    }

    const leaveType: LeaveType = {
      id: this.id('lt'),
      name: payload.name.trim(),
      paid: payload.paid,
      annualLimit: payload.annualLimit,
    };

    await this.db.query(`INSERT INTO leave_types (id, name, paid, annual_limit) VALUES ($1, $2, $3, $4)`, [
      leaveType.id,
      leaveType.name,
      leaveType.paid,
      leaveType.annualLimit ?? null,
    ]);
    return leaveType;
  }

  async listLeaveTypes() {
    const result = await this.db.query<{ id: string; name: string; paid: boolean; annual_limit: number | null }>(
      `SELECT id, name, paid, annual_limit FROM leave_types ORDER BY name ASC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      paid: row.paid,
      annualLimit: row.annual_limit ?? undefined,
    }));
  }

  async setManagerMap(ctx: LeaveContext, payload: EmployeeManagerMap) {
    this.assertHrAdmin(ctx);
    await this.db.query(
      `
      INSERT INTO leave_manager_map (employee_id, manager_id, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (employee_id)
      DO UPDATE SET manager_id = EXCLUDED.manager_id, updated_at = NOW()
      `,
      [payload.employeeId, payload.managerId],
    );

    return payload;
  }

  async allocateLeave(ctx: LeaveContext, payload: { employeeId: string; leaveTypeId: string; allocated: number }) {
    this.assertHrAdmin(ctx);

    const leaveType = await this.db.query<{ id: string }>(`SELECT id FROM leave_types WHERE id = $1 LIMIT 1`, [payload.leaveTypeId]);
    if (!leaveType.rows[0]) {
      throw new BadRequestException('Leave type does not exist.');
    }

    const existing = await this.db.query<{ id: string; used: number }>(
      `SELECT id, used FROM leave_allocations WHERE employee_id = $1 AND leave_type_id = $2 LIMIT 1`,
      [payload.employeeId, payload.leaveTypeId],
    );

    if (existing.rows[0]) {
      await this.db.query(
        `UPDATE leave_allocations SET allocated = $2, updated_at = NOW() WHERE id = $1`,
        [existing.rows[0].id, payload.allocated],
      );
      return {
        id: existing.rows[0].id,
        employeeId: payload.employeeId,
        leaveTypeId: payload.leaveTypeId,
        allocated: payload.allocated,
        used: existing.rows[0].used,
      };
    }

    const allocation: LeaveAllocation = {
      id: this.id('la'),
      employeeId: payload.employeeId,
      leaveTypeId: payload.leaveTypeId,
      allocated: payload.allocated,
      used: 0,
    };

    await this.db.query(
      `INSERT INTO leave_allocations (id, employee_id, leave_type_id, allocated, used, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [allocation.id, allocation.employeeId, allocation.leaveTypeId, allocation.allocated, allocation.used],
    );
    return allocation;
  }

  async requestLeave(
    ctx: LeaveContext,
    payload: {
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ) {
    if (ctx.role !== 'employee') {
      throw new UnauthorizedException('Only employees can create leave requests from this endpoint.');
    }

    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }

    if (payload.endDate < payload.startDate) {
      throw new BadRequestException('Leave date range is invalid.');
    }

    const leaveTypeResult = await this.db.query<{ id: string; paid: boolean }>(
      `SELECT id, paid FROM leave_types WHERE id = $1 LIMIT 1`,
      [payload.leaveTypeId],
    );
    const leaveType = leaveTypeResult.rows[0];
    if (!leaveType) {
      throw new BadRequestException('Leave type does not exist.');
    }

    const mappingResult = await this.db.query<{ employee_id: string; manager_id: string }>(
      `SELECT employee_id, manager_id FROM leave_manager_map WHERE employee_id = $1 LIMIT 1`,
      [ctx.employeeId],
    );
    const mapping = mappingResult.rows[0];
    if (!mapping) {
      throw new BadRequestException('Manager assignment is required before requesting leave.');
    }

    const days = this.diffDays(payload.startDate, payload.endDate);
    const allocationResult = await this.db.query<{ id: string; allocated: number; used: number }>(
      `SELECT id, allocated, used FROM leave_allocations WHERE employee_id = $1 AND leave_type_id = $2 LIMIT 1`,
      [ctx.employeeId, payload.leaveTypeId],
    );
    const allocation = allocationResult.rows[0];

    if (leaveType.paid) {
      if (!allocation) {
        throw new BadRequestException('Leave allocation is required before requesting paid leave.');
      }

      if (allocation.allocated - allocation.used < days) {
        throw new BadRequestException('Insufficient leave balance for this request.');
      }
    }

    const request: LeaveRequest = {
      id: this.id('lr'),
      employeeId: ctx.employeeId,
      managerId: mapping.manager_id,
      leaveTypeId: payload.leaveTypeId,
      startDate: payload.startDate,
      endDate: payload.endDate,
      reason: payload.reason,
      days,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    await this.db.query(
      `
      INSERT INTO leave_requests (
        id, employee_id, manager_id, leave_type_id, start_date, end_date, reason, days, status, manager_comment, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
      `,
      [
        request.id,
        request.employeeId,
        request.managerId,
        request.leaveTypeId,
        request.startDate,
        request.endDate,
        request.reason ?? null,
        request.days,
        request.status,
        request.managerComment ?? null,
      ],
    );

    await this.opsService.addNotification({
      userId: mapping.manager_id,
      type: 'leave',
      title: 'New leave request',
      message: `Employee ${ctx.employeeId} submitted leave request ${request.id}.`,
    });
    await this.opsService.addAudit({
      actorId: ctx.employeeId,
      action: 'leave.request.submitted',
      entity: 'leave_request',
      entityId: request.id,
      metadata: { leaveTypeId: request.leaveTypeId, days: request.days },
    });
    return request;
  }

  async listRequests(ctx: LeaveContext, query?: { employeeId?: string; managerId?: string }) {
    if (ctx.role === 'employee') {
      const result = await this.db.query<DbLeaveRequest>(
        `SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC`,
        [ctx.employeeId ?? ''],
      );
      return result.rows.map((row) => this.mapRequest(row));
    }

    if (ctx.role === 'manager') {
      if (!ctx.employeeId) {
        throw new UnauthorizedException('Manager context is missing.');
      }
      const result = await this.db.query<DbLeaveRequest>(
        `SELECT * FROM leave_requests WHERE manager_id = $1 ORDER BY created_at DESC`,
        [ctx.employeeId],
      );
      return result.rows.map((row) => this.mapRequest(row));
    }

    if (query?.employeeId) {
      const result = await this.db.query<DbLeaveRequest>(
        `SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC`,
        [query.employeeId],
      );
      return result.rows.map((row) => this.mapRequest(row));
    }

    if (query?.managerId) {
      const result = await this.db.query<DbLeaveRequest>(
        `SELECT * FROM leave_requests WHERE manager_id = $1 ORDER BY created_at DESC`,
        [query.managerId],
      );
      return result.rows.map((row) => this.mapRequest(row));
    }

    const result = await this.db.query<DbLeaveRequest>(`SELECT * FROM leave_requests ORDER BY created_at DESC`);
    return result.rows.map((row) => this.mapRequest(row));
  }

  async decideRequest(
    ctx: LeaveContext,
    payload: {
      requestId: string;
      decision: 'Approved' | 'Rejected';
      managerComment?: string;
    },
  ) {
    if (ctx.role !== 'manager') {
      throw new UnauthorizedException('Only managers can approve or reject leave requests.');
    }

    const result = await this.db.query<DbLeaveRequest>(`SELECT * FROM leave_requests WHERE id = $1 LIMIT 1`, [payload.requestId]);
    const request = result.rows[0];
    if (!request) {
      throw new NotFoundException('Leave request not found.');
    }

    if (request.manager_id !== ctx.employeeId) {
      throw new UnauthorizedException('Manager can only approve direct-report leave requests.');
    }

    if (request.status !== 'Pending') {
      throw new BadRequestException('Only pending requests can be updated.');
    }

    await this.db.query(
      `
      UPDATE leave_requests
      SET status = $2, manager_comment = $3, updated_at = NOW()
      WHERE id = $1
      `,
      [request.id, payload.decision, payload.managerComment ?? null],
    );

    if (payload.decision === 'Approved') {
      const allocation = await this.db.query<{ id: string; used: number }>(
        `SELECT id, used FROM leave_allocations WHERE employee_id = $1 AND leave_type_id = $2 LIMIT 1`,
        [request.employee_id, request.leave_type_id],
      );

      if (allocation.rows[0]) {
        await this.db.query(`UPDATE leave_allocations SET used = $2, updated_at = NOW() WHERE id = $1`, [
          allocation.rows[0].id,
          allocation.rows[0].used + request.days,
        ]);
      }
    }

    await this.opsService.addNotification({
      userId: request.employee_id,
      type: 'leave',
      title: `Leave ${payload.decision.toLowerCase()}`,
      message: `Your leave request ${request.id} was ${payload.decision.toLowerCase()}.`,
    });
    await this.opsService.addAudit({
      actorId: ctx.employeeId || 'manager',
      action: `leave.request.${payload.decision.toLowerCase()}`,
      entity: 'leave_request',
      entityId: request.id,
      metadata: { managerComment: payload.managerComment || '' },
    });

    return {
      ...this.mapRequest(request),
      status: payload.decision,
      managerComment: payload.managerComment,
    };
  }

  async getBalances(ctx: LeaveContext, employeeId?: string) {
    const targetEmployeeId = ctx.role === 'employee' ? ctx.employeeId : employeeId;
    if (!targetEmployeeId) {
      throw new BadRequestException('Employee ID is required to view balances.');
    }

    const result = await this.db.query<{
      id: string;
      employee_id: string;
      leave_type_id: string;
      allocated: number;
      used: number;
      leave_type_name: string;
    }>(
      `
      SELECT a.id,
             a.employee_id,
             a.leave_type_id,
             a.allocated,
             a.used,
             t.name AS leave_type_name
      FROM leave_allocations a
      JOIN leave_types t ON t.id = a.leave_type_id
      WHERE a.employee_id = $1
      ORDER BY t.name ASC
      `,
      [targetEmployeeId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      leaveTypeId: row.leave_type_id,
      allocated: row.allocated,
      used: row.used,
      remaining: row.allocated - row.used,
      leaveType: row.leave_type_name,
    }));
  }

  async seedDemoData() {
    const countResult = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM leave_types`);
    if (Number(countResult.rows[0]?.count || '0') === 0) {
      const annual = { id: this.id('lt'), name: 'Annual Leave', paid: true, annualLimit: 14 };
      const sick = { id: this.id('lt'), name: 'Sick Leave', paid: true, annualLimit: 8 };
      await this.db.query(
        `INSERT INTO leave_types (id, name, paid, annual_limit) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
        [annual.id, annual.name, annual.paid, annual.annualLimit, sick.id, sick.name, sick.paid, sick.annualLimit],
      );

      await this.db.query(
        `
        INSERT INTO leave_manager_map (employee_id, manager_id, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (employee_id)
        DO UPDATE SET manager_id = EXCLUDED.manager_id, updated_at = NOW()
        `,
        ['emp_demo_1', 'mgr_demo_1'],
      );

      await this.db.query(
        `
        INSERT INTO leave_allocations (id, employee_id, leave_type_id, allocated, used, updated_at)
        VALUES ($1, $2, $3, $4, 0, NOW()), ($5, $6, $7, $8, 0, NOW())
        `,
        [this.id('la'), 'emp_demo_1', annual.id, 14, this.id('la'), 'emp_demo_1', sick.id, 8],
      );
    }

    const leaveTypeCount = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM leave_types`);
    return {
      message: 'Leave demo baseline is ready.',
      leaveTypes: Number(leaveTypeCount.rows[0]?.count || '0'),
    };
  }

  async onLeaveCount(date = new Date().toISOString().slice(0, 10)) {
    const result = await this.db.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM leave_requests
      WHERE status = 'Approved'
        AND start_date <= $1
        AND end_date >= $1
      `,
      [date],
    );
    return Number(result.rows[0]?.count || '0');
  }

  private assertHrAdmin(ctx: LeaveContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can perform this action.');
    }
  }

  private diffDays(startDate: string, endDate: string) {
    const start = new Date(`${startDate}T00:00:00Z`).getTime();
    const end = new Date(`${endDate}T00:00:00Z`).getTime();
    return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private mapRequest(row: DbLeaveRequest): LeaveRequest {
    return {
      id: row.id,
      employeeId: row.employee_id,
      managerId: row.manager_id,
      leaveTypeId: row.leave_type_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason ?? undefined,
      days: row.days,
      status: row.status,
      managerComment: row.manager_comment ?? undefined,
      createdAt: row.created_at,
    };
  }
}

interface DbLeaveRequest {
  id: string;
  employee_id: string;
  manager_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  days: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  manager_comment: string | null;
  created_at: string;
}
