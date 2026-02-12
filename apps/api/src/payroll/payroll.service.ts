import { BadRequestException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { PayrollEntry, PayrollRole, Payslip, SalaryComponent } from './payroll.types';
import { OpsService } from '../ops/ops.service';
import { DatabaseService } from '../database/database.service';

interface PayrollContext {
  role: PayrollRole;
  employeeId?: string;
}

interface DbComponent {
  id: string;
  employee_id: string;
  type: 'earning' | 'deduction';
  name: string;
  amount: number;
  effective_from: string;
}

interface DbEntry {
  employee_id: string;
  month: string;
  gross: number;
  deductions: number;
  net: number;
  status: 'Draft' | 'Finalized';
}

@Injectable()
export class PayrollService implements OnModuleInit {
  constructor(
    private readonly opsService: OpsService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS payroll_components (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('earning','deduction')),
        name TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
        effective_from DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS payroll_entries (
        employee_id TEXT NOT NULL,
        month TEXT NOT NULL,
        gross NUMERIC(12,2) NOT NULL,
        deductions NUMERIC(12,2) NOT NULL,
        net NUMERIC(12,2) NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('Draft','Finalized')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (employee_id, month)
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS payroll_payslips (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        month TEXT NOT NULL,
        gross NUMERIC(12,2) NOT NULL,
        deductions NUMERIC(12,2) NOT NULL,
        net NUMERIC(12,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_payroll_payslip UNIQUE (employee_id, month)
      );
    `);
  }

  async addComponent(
    ctx: PayrollContext,
    payload: { employeeId: string; type: 'earning' | 'deduction'; name: string; amount: number; effectiveFrom: string },
  ) {
    this.assertHrAdmin(ctx);
    if (!payload.employeeId?.trim() || !payload.name?.trim() || payload.amount < 0) {
      throw new BadRequestException('Invalid salary component payload.');
    }

    const component: SalaryComponent = {
      id: this.id('sc'),
      ...payload,
    };

    await this.db.query(
      `
      INSERT INTO payroll_components (id, employee_id, type, name, amount, effective_from)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [component.id, component.employeeId, component.type, component.name, component.amount, component.effectiveFrom],
    );

    return component;
  }

  async listComponents(ctx: PayrollContext, employeeId?: string) {
    const targetId = ctx.role === 'employee' ? ctx.employeeId : employeeId;
    const result = targetId
      ? await this.db.query<DbComponent>(
          `SELECT id, employee_id, type, name, amount, effective_from FROM payroll_components WHERE employee_id = $1 ORDER BY effective_from DESC`,
          [targetId],
        )
      : await this.db.query<DbComponent>(
          `SELECT id, employee_id, type, name, amount, effective_from FROM payroll_components ORDER BY employee_id ASC, effective_from DESC`,
        );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      type: row.type,
      name: row.name,
      amount: Number(row.amount),
      effectiveFrom: row.effective_from,
    }));
  }

  async runDraft(ctx: PayrollContext, payload: { month: string; employeeIds: string[] }) {
    this.assertHrAdmin(ctx);

    const month = payload.month;
    if (!month?.trim() || !payload.employeeIds?.length) {
      throw new BadRequestException('Month and employee list are required.');
    }

    const results: PayrollEntry[] = [];

    for (const employeeId of payload.employeeIds) {
      const existing = await this.db.query<DbEntry>(
        `SELECT employee_id, month, gross, deductions, net, status FROM payroll_entries WHERE employee_id = $1 AND month = $2 LIMIT 1`,
        [employeeId, month],
      );

      if (existing.rows[0]?.status === 'Finalized') {
        throw new BadRequestException(`Payroll is already finalized for employee ${employeeId} in ${month}.`);
      }

      const componentRows = await this.db.query<{ type: 'earning' | 'deduction'; amount: number }>(
        `SELECT type, amount FROM payroll_components WHERE employee_id = $1`,
        [employeeId],
      );
      const gross = componentRows.rows.filter((c) => c.type === 'earning').reduce((sum, c) => sum + Number(c.amount), 0);
      const deductions = componentRows.rows
        .filter((c) => c.type === 'deduction')
        .reduce((sum, c) => sum + Number(c.amount), 0);
      const net = gross - deductions;

      if (existing.rows[0]) {
        await this.db.query(
          `
          UPDATE payroll_entries
          SET gross = $3,
              deductions = $4,
              net = $5,
              status = 'Draft',
              updated_at = NOW()
          WHERE employee_id = $1 AND month = $2
          `,
          [employeeId, month, gross, deductions, net],
        );
      } else {
        await this.db.query(
          `
          INSERT INTO payroll_entries (employee_id, month, gross, deductions, net, status, updated_at)
          VALUES ($1, $2, $3, $4, $5, 'Draft', NOW())
          `,
          [employeeId, month, gross, deductions, net],
        );
      }

      results.push({ employeeId, month, gross, deductions, net, status: 'Draft' });
    }

    return results;
  }

  async finalizeMonth(ctx: PayrollContext, payload: { month: string; employeeIds: string[] }) {
    this.assertHrAdmin(ctx);

    const finalized: PayrollEntry[] = [];

    for (const employeeId of payload.employeeIds) {
      const entryResult = await this.db.query<DbEntry>(
        `SELECT employee_id, month, gross, deductions, net, status FROM payroll_entries WHERE employee_id = $1 AND month = $2 LIMIT 1`,
        [employeeId, payload.month],
      );

      const entry = entryResult.rows[0];
      if (!entry || entry.status !== 'Draft') {
        throw new BadRequestException(`Draft payroll not found for employee ${employeeId} in ${payload.month}.`);
      }

      await this.db.transaction(async (query) => {
        await query(
          `
          UPDATE payroll_entries
          SET status = 'Finalized',
              updated_at = NOW()
          WHERE employee_id = $1 AND month = $2
          `,
          [employeeId, payload.month],
        );

        await query(
          `
          INSERT INTO payroll_payslips (id, employee_id, month, gross, deductions, net)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (employee_id, month)
          DO NOTHING
          `,
          [this.id('ps'), employeeId, payload.month, entry.gross, entry.deductions, entry.net],
        );
      });

      await this.opsService.addNotification({
        userId: employeeId,
        type: 'payroll',
        title: `Payslip available for ${payload.month}`,
        message: `Your payroll for ${payload.month} has been finalized.`,
      });
      await this.opsService.addAudit({
        actorId: ctx.employeeId || 'hr_admin',
        action: 'payroll.finalized',
        entity: 'payroll_entry',
        entityId: `${employeeId}:${payload.month}`,
        metadata: { net: Number(entry.net) },
      });

      finalized.push({
        employeeId,
        month: payload.month,
        gross: Number(entry.gross),
        deductions: Number(entry.deductions),
        net: Number(entry.net),
        status: 'Finalized',
      });
    }

    return finalized;
  }

  async listPayrollEntries(ctx: PayrollContext, query?: { month?: string; employeeId?: string }) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (ctx.role === 'employee') {
      where.push(`employee_id = $${params.push(ctx.employeeId ?? '')}`);
    }

    if (query?.month) {
      where.push(`month = $${params.push(query.month)}`);
    }

    if (query?.employeeId && ctx.role !== 'employee') {
      where.push(`employee_id = $${params.push(query.employeeId)}`);
    }

    const sql = `
      SELECT employee_id, month, gross, deductions, net, status
      FROM payroll_entries
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY month DESC, employee_id ASC
    `;

    const result = await this.db.query<DbEntry>(sql, params);
    return result.rows.map((row) => ({
      employeeId: row.employee_id,
      month: row.month,
      gross: Number(row.gross),
      deductions: Number(row.deductions),
      net: Number(row.net),
      status: row.status,
    }));
  }

  async listPayslips(ctx: PayrollContext, employeeId?: string) {
    const targetId = ctx.role === 'employee' ? ctx.employeeId : employeeId;
    const result = targetId
      ? await this.db.query<{ id: string; employee_id: string; month: string; gross: number; deductions: number; net: number }>(
          `SELECT id, employee_id, month, gross, deductions, net FROM payroll_payslips WHERE employee_id = $1 ORDER BY month DESC`,
          [targetId],
        )
      : await this.db.query<{ id: string; employee_id: string; month: string; gross: number; deductions: number; net: number }>(
          `SELECT id, employee_id, month, gross, deductions, net FROM payroll_payslips ORDER BY month DESC, employee_id ASC`,
        );

    return result.rows.map((row): Payslip => ({
      id: row.id,
      employeeId: row.employee_id,
      month: row.month,
      gross: Number(row.gross),
      deductions: Number(row.deductions),
      net: Number(row.net),
    }));
  }

  async monthlySummary(ctx: PayrollContext, month: string) {
    this.assertHrAdmin(ctx);
    const result = await this.db.query<{ total_gross: string; total_deductions: string; total_net: string; employee_count: string }>(
      `
      SELECT COALESCE(SUM(gross), 0)::text AS total_gross,
             COALESCE(SUM(deductions), 0)::text AS total_deductions,
             COALESCE(SUM(net), 0)::text AS total_net,
             COUNT(*)::text AS employee_count
      FROM payroll_entries
      WHERE month = $1 AND status = 'Finalized'
      `,
      [month],
    );

    return {
      month,
      totalGross: Number(result.rows[0]?.total_gross || '0'),
      totalDeductions: Number(result.rows[0]?.total_deductions || '0'),
      totalNet: Number(result.rows[0]?.total_net || '0'),
      employeeCount: Number(result.rows[0]?.employee_count || '0'),
    };
  }

  async seedDemoData() {
    const count = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM payroll_components`);
    if (Number(count.rows[0]?.count || '0') === 0) {
      await this.db.query(
        `
        INSERT INTO payroll_components (id, employee_id, type, name, amount, effective_from)
        VALUES
          ($1, 'emp_demo_1', 'earning', 'Basic Salary', 2000, '2026-01-01'),
          ($2, 'emp_demo_1', 'deduction', 'Tax', 200, '2026-01-01')
        `,
        [this.id('sc'), this.id('sc')],
      );
    }

    const total = await this.db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM payroll_components`);
    return { message: 'Payroll demo baseline is ready.', componentCount: Number(total.rows[0]?.count || '0') };
  }

  private assertHrAdmin(ctx: PayrollContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can perform payroll actions.');
    }
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
