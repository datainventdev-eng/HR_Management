import { LeaveService } from '../src/leave/leave.service';

describe('LeaveService', () => {
  it('blocks invalid leave date range', () => {
    const service = new LeaveService();
    const admin = { role: 'hr_admin' as const };

    const type = service.createLeaveType(admin, { name: 'Annual', paid: true, annualLimit: 10 });
    service.setManagerMap(admin, { employeeId: 'emp_1', managerId: 'mgr_1' });
    service.allocateLeave(admin, { employeeId: 'emp_1', leaveTypeId: type.id, allocated: 10 });

    expect(() =>
      service.requestLeave(
        { role: 'employee', employeeId: 'emp_1' },
        { leaveTypeId: type.id, startDate: '2026-02-15', endDate: '2026-02-14' },
      ),
    ).toThrow('date range is invalid');
  });

  it('blocks manager approval for non direct-report request', () => {
    const service = new LeaveService();
    const admin = { role: 'hr_admin' as const };

    const type = service.createLeaveType(admin, { name: 'Annual', paid: true, annualLimit: 10 });
    service.setManagerMap(admin, { employeeId: 'emp_1', managerId: 'mgr_1' });
    service.allocateLeave(admin, { employeeId: 'emp_1', leaveTypeId: type.id, allocated: 10 });

    const request = service.requestLeave(
      { role: 'employee', employeeId: 'emp_1' },
      { leaveTypeId: type.id, startDate: '2026-02-15', endDate: '2026-02-15' },
    );

    expect(() =>
      service.decideRequest(
        { role: 'manager', employeeId: 'mgr_2' },
        { requestId: request.id, decision: 'Approved' },
      ),
    ).toThrow('direct-report');
  });
});
