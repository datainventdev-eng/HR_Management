import { ReportsService } from '../src/reports/reports.service';

describe('ReportsService', () => {
  it('restricts payroll report to hr_admin', () => {
    const service = new ReportsService();
    expect(() => service.payrollReport({ role: 'manager' }, '2026-02')).toThrow('Only HR Admin');
  });

  it('returns attendance csv with key metrics', () => {
    const service = new ReportsService();
    const csv = service.exportCsv({ role: 'manager' }, 'attendance');
    expect(csv).toContain('presentDays');
    expect(csv).toContain('lateCount');
  });
});
