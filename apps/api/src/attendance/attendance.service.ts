import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AttendanceRecord, AttendanceRole, OfficeHours, Shift, ShiftAssignment } from './attendance.types';

interface AttendanceContext {
  role: AttendanceRole;
  employeeId?: string;
}

@Injectable()
export class AttendanceService {
  private readonly attendance: AttendanceRecord[] = [];
  private readonly shifts: Shift[] = [];
  private readonly assignments: ShiftAssignment[] = [];
  private officeHours: OfficeHours = {
    startTime: '09:00',
    endTime: '18:00',
  };

  setOfficeHours(ctx: AttendanceContext, payload: OfficeHours) {
    this.assertHrAdmin(ctx);
    this.officeHours = payload;
    return this.officeHours;
  }

  getOfficeHours() {
    return this.officeHours;
  }

  createShift(ctx: AttendanceContext, payload: { name: string; startTime: string; endTime: string }) {
    this.assertHrAdmin(ctx);
    if (!payload.name?.trim()) {
      throw new BadRequestException('Shift name is required.');
    }

    const shift: Shift = {
      id: this.id('shift'),
      name: payload.name.trim(),
      startTime: payload.startTime,
      endTime: payload.endTime,
    };

    this.shifts.push(shift);
    return shift;
  }

  listShifts() {
    return this.shifts;
  }

  assignShift(
    ctx: AttendanceContext,
    payload: {
      employeeId: string;
      shiftId: string;
      fromDate: string;
      toDate: string;
    },
  ) {
    this.assertHrAdmin(ctx);

    if (!this.shifts.some((shift) => shift.id === payload.shiftId)) {
      throw new BadRequestException('Shift does not exist.');
    }

    if (payload.toDate < payload.fromDate) {
      throw new BadRequestException('Shift assignment date range is invalid.');
    }

    const assignment: ShiftAssignment = {
      id: this.id('assign'),
      ...payload,
    };

    this.assignments.push(assignment);
    return assignment;
  }

  listAssignments(ctx: AttendanceContext, employeeId?: string) {
    if (ctx.role === 'employee') {
      if (!ctx.employeeId) {
        throw new UnauthorizedException('Employee context is missing.');
      }
      return this.assignments.filter((assignment) => assignment.employeeId === ctx.employeeId);
    }

    if (ctx.role === 'manager') {
      return employeeId ? this.assignments.filter((assignment) => assignment.employeeId === employeeId) : [];
    }

    return employeeId ? this.assignments.filter((assignment) => assignment.employeeId === employeeId) : this.assignments;
  }

  checkIn(ctx: AttendanceContext, payload?: { date?: string; time?: string }) {
    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }

    if (ctx.role === 'hr_admin') {
      throw new UnauthorizedException('HR Admin cannot check in as employee from this endpoint.');
    }

    const date = payload?.date ?? this.today();
    const time = payload?.time ?? this.currentTime();

    let record = this.attendance.find((entry) => entry.employeeId === ctx.employeeId && entry.date === date);

    if (record?.checkInTime) {
      throw new BadRequestException('You already checked in for this day.');
    }

    if (!record) {
      record = {
        id: this.id('att'),
        employeeId: ctx.employeeId,
        date,
        isLate: this.isAfter(time, this.officeHours.startTime),
        leftEarly: false,
      };
      this.attendance.push(record);
    }

    record.checkInTime = time;
    record.isLate = this.isAfter(time, this.officeHours.startTime);

    return record;
  }

  checkOut(ctx: AttendanceContext, payload?: { date?: string; time?: string }) {
    if (!ctx.employeeId) {
      throw new UnauthorizedException('Employee context is missing.');
    }

    if (ctx.role === 'hr_admin') {
      throw new UnauthorizedException('HR Admin cannot check out as employee from this endpoint.');
    }

    const date = payload?.date ?? this.today();
    const time = payload?.time ?? this.currentTime();
    const record = this.attendance.find((entry) => entry.employeeId === ctx.employeeId && entry.date === date);

    if (!record?.checkInTime) {
      throw new BadRequestException('Check-in is required before check-out.');
    }

    if (record.checkOutTime) {
      throw new BadRequestException('You already checked out for this day.');
    }

    record.checkOutTime = time;
    record.leftEarly = this.isBefore(time, this.officeHours.endTime);
    record.totalHours = this.hoursBetween(record.checkInTime, time);

    return record;
  }

  monthlyAttendance(ctx: AttendanceContext, payload?: { employeeId?: string; month?: string }) {
    const month = payload?.month ?? this.today().slice(0, 7);

    let targetEmployeeId = payload?.employeeId;

    if (ctx.role === 'employee') {
      targetEmployeeId = ctx.employeeId;
    }

    if (!targetEmployeeId) {
      throw new BadRequestException('Employee ID is required for this view.');
    }

    return this.attendance.filter((record) => record.employeeId === targetEmployeeId && record.date.startsWith(month));
  }

  seedDemoData() {
    if (this.shifts.length === 0) {
      this.shifts.push({ id: this.id('shift'), name: 'General', startTime: '09:00', endTime: '18:00' });
    }

    return {
      message: 'Attendance demo baseline is ready.',
      shiftCount: this.shifts.length,
      officeHours: this.officeHours,
    };
  }

  todaySummary(date = this.today()) {
    const rows = this.attendance.filter((record) => record.date === date);
    return {
      date,
      presentCount: rows.filter((row) => Boolean(row.checkInTime)).length,
      lateCount: rows.filter((row) => row.isLate).length,
      earlyLeaveCount: rows.filter((row) => row.leftEarly).length,
    };
  }

  private assertHrAdmin(ctx: AttendanceContext) {
    if (ctx.role !== 'hr_admin') {
      throw new UnauthorizedException('Only HR Admin can perform this action.');
    }
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private currentTime() {
    return new Date().toISOString().slice(11, 16);
  }

  private hoursBetween(start: string, end: string) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    return Number((minutes / 60).toFixed(2));
  }

  private isAfter(left: string, right: string) {
    return left > right;
  }

  private isBefore(left: string, right: string) {
    return left < right;
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
