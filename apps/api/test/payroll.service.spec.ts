import { PayrollService } from '../src/payroll/payroll.service';

describe('PayrollService', () => {
  it('prevents duplicate finalize for same employee and month', () => {
    const service = new PayrollService();
    const admin = { role: 'hr_admin' as const };

    service.addComponent(admin, {
      employeeId: 'emp_1',
      type: 'earning',
      name: 'Basic',
      amount: 1000,
      effectiveFrom: '2026-01-01',
    });

    service.runDraft(admin, { month: '2026-02', employeeIds: ['emp_1'] });
    service.finalizeMonth(admin, { month: '2026-02', employeeIds: ['emp_1'] });

    expect(() => service.runDraft(admin, { month: '2026-02', employeeIds: ['emp_1'] })).toThrow('already finalized');
  });
});
