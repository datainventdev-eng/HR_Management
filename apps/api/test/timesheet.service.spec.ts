import { TimesheetService } from '../src/timesheet/timesheet.service';

describe('TimesheetService', () => {
  it('enforces manager authorization for timesheet decisions', () => {
    const service = new TimesheetService();
    service.seedDemoData();

    const submitted = service.submitTimesheet(
      { role: 'employee', employeeId: 'emp_demo_1' },
      {
        weekStartDate: '2026-02-09',
        entries: [
          { day: 'Mon', hours: 8 },
          { day: 'Tue', hours: 8 },
        ],
      },
    );

    expect(() =>
      service.decideTimesheet(
        { role: 'manager', employeeId: 'mgr_other' },
        { timesheetId: submitted.id, decision: 'Approved' },
      ),
    ).toThrow('direct-report');
  });

  it('tracks status transition from Submitted to Approved', () => {
    const service = new TimesheetService();
    service.seedDemoData();

    const submitted = service.submitTimesheet(
      { role: 'employee', employeeId: 'emp_demo_1' },
      {
        weekStartDate: '2026-02-16',
        entries: [
          { day: 'Mon', hours: 8 },
          { day: 'Tue', hours: 7 },
        ],
      },
    );

    const decided = service.decideTimesheet(
      { role: 'manager', employeeId: 'mgr_demo_1' },
      { timesheetId: submitted.id, decision: 'Approved', managerComment: 'Looks good' },
    );

    expect(decided.status).toBe('Approved');
    expect(decided.history.some((h) => h.status === 'Submitted')).toBe(true);
    expect(decided.history.some((h) => h.status === 'Approved')).toBe(true);
  });
});
