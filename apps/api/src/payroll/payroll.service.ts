import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PayrollEntry, PayrollRole, Payslip, SalaryComponent } from './payroll.types';
import { OpsService } from '../ops/ops.service';

interface PayrollContext {
  role: PayrollRole;
  employeeId?: string;
}

@Injectable()
export class PayrollService {
  private readonly components: SalaryComponent[] = [];
  private readonly payrollEntries: PayrollEntry[] = [];
  private readonly payslips: Payslip[] = [];

  constructor(private readonly opsService: OpsService) {}

  addComponent(
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

    this.components.push(component);
    return component;
  }

  listComponents(ctx: PayrollContext, employeeId?: string) {
    const targetId = ctx.role === 'employee' ? ctx.employeeId : employeeId;
    if (!targetId) {
      return this.components;
    }
    return this.components.filter((component) => component.employeeId === targetId);
  }

  runDraft(ctx: PayrollContext, payload: { month: string; employeeIds: string[] }) {
    this.assertHrAdmin(ctx);

    const month = payload.month;
    if (!month?.trim() || !payload.employeeIds?.length) {
      throw new BadRequestException('Month and employee list are required.');
    }

    const results: PayrollEntry[] = [];

    for (const employeeId of payload.employeeIds) {
      const finalizedExists = this.payrollEntries.some(
        (entry) => entry.employeeId === employeeId && entry.month === month && entry.status === 'Finalized',
      );

      if (finalizedExists) {
        throw new BadRequestException(`Payroll is already finalized for employee ${employeeId} in ${month}.`);
      }

      const employeeComponents = this.components.filter((component) => component.employeeId === employeeId);
      const gross = employeeComponents.filter((c) => c.type === 'earning').reduce((sum, c) => sum + c.amount, 0);
      const deductions = employeeComponents.filter((c) => c.type === 'deduction').reduce((sum, c) => sum + c.amount, 0);

      const existingDraft = this.payrollEntries.find(
        (entry) => entry.employeeId === employeeId && entry.month === month && entry.status === 'Draft',
      );

      if (existingDraft) {
        existingDraft.gross = gross;
        existingDraft.deductions = deductions;
        existingDraft.net = gross - deductions;
        results.push(existingDraft);
      } else {
        const entry: PayrollEntry = {
          employeeId,
          month,
          gross,
          deductions,
          net: gross - deductions,
          status: 'Draft',
        };
        this.payrollEntries.push(entry);
        results.push(entry);
      }
    }

    return results;
  }

  finalizeMonth(ctx: PayrollContext, payload: { month: string; employeeIds: string[] }) {
    this.assertHrAdmin(ctx);

    const finalized: PayrollEntry[] = [];

    for (const employeeId of payload.employeeIds) {
      const entry = this.payrollEntries.find(
        (item) => item.employeeId === employeeId && item.month === payload.month && item.status === 'Draft',
      );

      if (!entry) {
        throw new BadRequestException(`Draft payroll not found for employee ${employeeId} in ${payload.month}.`);
      }

      const duplicateFinalized = this.payrollEntries.some(
        (item) => item.employeeId === employeeId && item.month === payload.month && item.status === 'Finalized',
      );

      if (duplicateFinalized) {
        throw new BadRequestException(`Payroll already finalized for employee ${employeeId} in ${payload.month}.`);
      }

      entry.status = 'Finalized';
      finalized.push(entry);

      const existingPayslip = this.payslips.find((p) => p.employeeId === employeeId && p.month === payload.month);
      if (!existingPayslip) {
        this.payslips.push({
          id: this.id('ps'),
          employeeId,
          month: payload.month,
          gross: entry.gross,
          deductions: entry.deductions,
          net: entry.net,
        });
      }

      this.opsService.addNotification({
        userId: employeeId,
        type: 'payroll',
        title: `Payslip available for ${payload.month}`,
        message: `Your payroll for ${payload.month} has been finalized.`,
      });
      this.opsService.addAudit({
        actorId: ctx.employeeId || 'hr_admin',
        action: 'payroll.finalized',
        entity: 'payroll_entry',
        entityId: `${employeeId}:${payload.month}`,
        metadata: { net: entry.net },
      });
    }

    return finalized;
  }

  listPayrollEntries(ctx: PayrollContext, query?: { month?: string; employeeId?: string }) {
    let list = this.payrollEntries;

    if (ctx.role === 'employee') {
      list = list.filter((entry) => entry.employeeId === ctx.employeeId);
    }

    if (query?.month) {
      list = list.filter((entry) => entry.month === query.month);
    }

    if (query?.employeeId && ctx.role !== 'employee') {
      list = list.filter((entry) => entry.employeeId === query.employeeId);
    }

    return list;
  }

  listPayslips(ctx: PayrollContext, employeeId?: string) {
    const targetId = ctx.role === 'employee' ? ctx.employeeId : employeeId;
    if (!targetId) {
      return this.payslips;
    }
    return this.payslips.filter((payslip) => payslip.employeeId === targetId);
  }

  monthlySummary(ctx: PayrollContext, month: string) {
    this.assertHrAdmin(ctx);
    const monthly = this.payrollEntries.filter((entry) => entry.month === month && entry.status === 'Finalized');

    return {
      month,
      totalGross: monthly.reduce((sum, row) => sum + row.gross, 0),
      totalDeductions: monthly.reduce((sum, row) => sum + row.deductions, 0),
      totalNet: monthly.reduce((sum, row) => sum + row.net, 0),
      employeeCount: monthly.length,
    };
  }

  seedDemoData() {
    if (this.components.length === 0) {
      this.components.push(
        {
          id: this.id('sc'),
          employeeId: 'emp_demo_1',
          type: 'earning',
          name: 'Basic Salary',
          amount: 2000,
          effectiveFrom: '2026-01-01',
        },
        {
          id: this.id('sc'),
          employeeId: 'emp_demo_1',
          type: 'deduction',
          name: 'Tax',
          amount: 200,
          effectiveFrom: '2026-01-01',
        },
      );
    }

    return { message: 'Payroll demo baseline is ready.', componentCount: this.components.length };
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
