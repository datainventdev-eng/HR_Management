import { AttendanceService } from '../src/attendance/attendance.service';

describe('AttendanceService', () => {
  it('blocks duplicate check-in on the same day', () => {
    const service = new AttendanceService();
    const ctx = { role: 'employee' as const, employeeId: 'emp_1' };

    service.checkIn(ctx, { date: '2026-02-11', time: '09:05' });

    expect(() => service.checkIn(ctx, { date: '2026-02-11', time: '09:10' })).toThrow('already checked in');
  });

  it('blocks check-out before check-in', () => {
    const service = new AttendanceService();
    const ctx = { role: 'employee' as const, employeeId: 'emp_1' };

    expect(() => service.checkOut(ctx, { date: '2026-02-11', time: '18:00' })).toThrow('Check-in is required');
  });
});
