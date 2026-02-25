import { BadRequestException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { WfhRequest, WfhRole } from './wfh.types';

interface WfhContext {
  role: WfhRole;
  employeeId?: string;
}

interface DbWfhRequest {
  id: string;
  employee_id: string;
  employee_name: string | null;
  start_date: string | Date;
  end_date: string | Date;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  manager_comment: string | null;
  created_at: string | Date;
}

@Injectable()
export class WfhService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS wfh_requests (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('Pending','Approved','Rejected')),
        manager_comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async request(ctx: WfhContext, payload: { startDate: string; endDate: string; reason: string }) {
    if (ctx.role !== 'employee') {
      throw new UnauthorizedException('Only employees can create WFH requests from this endpoint.');
    }
    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }
    if (!payload.reason?.trim()) {
      throw new BadRequestException('Reason is required.');
    }
    if (!payload.startDate || !payload.endDate || payload.endDate < payload.startDate) {
      throw new BadRequestException('WFH date range is invalid.');
    }

    const request: WfhRequest = {
      id: this.id('wfh'),
      employeeId: ctx.employeeId,
      startDate: payload.startDate,
      endDate: payload.endDate,
      reason: payload.reason.trim(),
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    await this.db.query(
      `
      INSERT INTO wfh_requests (id, employee_id, start_date, end_date, reason, status, manager_comment, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      `,
      [request.id, request.employeeId, request.startDate, request.endDate, request.reason, request.status, null],
    );

    return request;
  }

  async list(ctx: WfhContext, query?: { employeeId?: string }) {
    const baseSelect = `
      SELECT
        r.id,
        r.employee_id,
        COALESCE(e.full_name, u.full_name, r.employee_id) AS employee_name,
        r.start_date,
        r.end_date,
        r.reason,
        r.status,
        r.manager_comment,
        r.created_at
      FROM wfh_requests r
      LEFT JOIN core_employees e ON e.id = r.employee_id
      LEFT JOIN app_users u ON u.employee_id = r.employee_id
    `;

    if (ctx.role === 'employee') {
      if (!ctx.employeeId) {
        throw new UnauthorizedException('Employee context is missing.');
      }
      const result = await this.db.query<DbWfhRequest>(
        `${baseSelect} WHERE r.employee_id = $1 ORDER BY r.created_at DESC`,
        [ctx.employeeId],
      );
      return result.rows.map((row) => this.map(row));
    }

    if (query?.employeeId) {
      const result = await this.db.query<DbWfhRequest>(
        `${baseSelect} WHERE r.employee_id = $1 ORDER BY r.created_at DESC`,
        [query.employeeId],
      );
      return result.rows.map((row) => this.map(row));
    }

    const result = await this.db.query<DbWfhRequest>(`${baseSelect} ORDER BY r.created_at DESC`);
    return result.rows.map((row) => this.map(row));
  }

  async decide(
    ctx: WfhContext,
    payload: { requestId: string; decision: 'Approved' | 'Rejected'; managerComment?: string },
  ) {
    if (ctx.role !== 'manager' && ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only managers or HR Admin can approve/reject WFH requests.');
    }

    const existing = await this.db.query<DbWfhRequest>(
      `
      SELECT
        r.id,
        r.employee_id,
        COALESCE(e.full_name, u.full_name, r.employee_id) AS employee_name,
        r.start_date,
        r.end_date,
        r.reason,
        r.status,
        r.manager_comment,
        r.created_at
      FROM wfh_requests r
      LEFT JOIN core_employees e ON e.id = r.employee_id
      LEFT JOIN app_users u ON u.employee_id = r.employee_id
      WHERE r.id = $1
      LIMIT 1
      `,
      [payload.requestId],
    );

    const request = existing.rows[0];
    if (!request) {
      throw new NotFoundException('WFH request not found.');
    }
    if (request.status !== 'Pending') {
      throw new BadRequestException('Only pending requests can be updated.');
    }

    await this.db.query(
      `UPDATE wfh_requests SET status = $2, manager_comment = $3, updated_at = NOW() WHERE id = $1`,
      [payload.requestId, payload.decision, payload.managerComment?.trim() || null],
    );

    return {
      ...this.map(request),
      status: payload.decision,
      managerComment: payload.managerComment?.trim() || undefined,
    };
  }

  private map(row: DbWfhRequest): WfhRequest {
    return {
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name || undefined,
      startDate: this.toDateOnly(row.start_date),
      endDate: this.toDateOnly(row.end_date),
      reason: row.reason,
      status: row.status,
      managerComment: row.manager_comment || undefined,
      createdAt: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString(),
    };
  }

  private toDateOnly(value: string | Date) {
    if (typeof value === 'string') return value.slice(0, 10);
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
