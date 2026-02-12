import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollRole } from './payroll.types';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('seed-demo')
  seedDemo() {
    return this.payrollService.seedDemoData();
  }

  @Post('components')
  addComponent(
    @Headers() headers: Record<string, string>,
    @Body() body: { employeeId: string; type: 'earning' | 'deduction'; name: string; amount: number; effectiveFrom: string },
  ) {
    return this.payrollService.addComponent(this.ctx(headers), body);
  }

  @Get('components')
  listComponents(@Headers() headers: Record<string, string>, @Query('employeeId') employeeId?: string) {
    return this.payrollService.listComponents(this.ctx(headers), employeeId);
  }

  @Post('run-draft')
  runDraft(@Headers() headers: Record<string, string>, @Body() body: { month: string; employeeIds: string[] }) {
    return this.payrollService.runDraft(this.ctx(headers), body);
  }

  @Post('finalize')
  finalize(@Headers() headers: Record<string, string>, @Body() body: { month: string; employeeIds: string[] }) {
    return this.payrollService.finalizeMonth(this.ctx(headers), body);
  }

  @Get('entries')
  entries(
    @Headers() headers: Record<string, string>,
    @Query('month') month?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.payrollService.listPayrollEntries(this.ctx(headers), { month, employeeId });
  }

  @Get('payslips')
  payslips(@Headers() headers: Record<string, string>, @Query('employeeId') employeeId?: string) {
    return this.payrollService.listPayslips(this.ctx(headers), employeeId);
  }

  @Get('summary')
  summary(@Headers() headers: Record<string, string>, @Query('month') month: string) {
    return this.payrollService.monthlySummary(this.ctx(headers), month);
  }

  private ctx(headers: Record<string, string>) {
    return {
      role: (headers['x-role'] || 'employee') as PayrollRole,
      employeeId: headers['x-employee-id'],
    };
  }
}
