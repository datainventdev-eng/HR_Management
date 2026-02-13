import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceRole } from './attendance.types';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('seed-demo')
  seedDemo() {
    return this.attendanceService.seedDemoData();
  }

  @Get('office-hours')
  getOfficeHours() {
    return this.attendanceService.getOfficeHours();
  }

  @Post('office-hours')
  setOfficeHours(@Headers() headers: Record<string, string>, @Body() body: { startTime: string; endTime: string }) {
    return this.attendanceService.setOfficeHours(this.ctx(headers), body);
  }

  @Get('shifts')
  listShifts() {
    return this.attendanceService.listShifts();
  }

  @Post('shifts')
  createShift(@Headers() headers: Record<string, string>, @Body() body: { name: string; startTime: string; endTime: string }) {
    return this.attendanceService.createShift(this.ctx(headers), body);
  }

  @Get('shift-assignments')
  listAssignments(@Headers() headers: Record<string, string>, @Query('employeeId') employeeId?: string) {
    return this.attendanceService.listAssignments(this.ctx(headers), employeeId);
  }

  @Post('shift-assignments')
  assignShift(
    @Headers() headers: Record<string, string>,
    @Body() body: { employeeId: string; shiftId: string; fromDate: string; toDate: string },
  ) {
    return this.attendanceService.assignShift(this.ctx(headers), body);
  }

  @Post('check-in')
  checkIn(@Headers() headers: Record<string, string>, @Body() body?: { date?: string; time?: string }) {
    return this.attendanceService.checkIn(this.ctx(headers), body);
  }

  @Post('admin/bulk-check-in')
  bulkCheckIn(
    @Headers() headers: Record<string, string>,
    @Body() body: { entries: Array<{ employeeId: string; date?: string; time?: string }> },
  ) {
    return this.attendanceService.bulkCheckInByAdmin(this.ctx(headers), body);
  }

  @Post('check-out')
  checkOut(@Headers() headers: Record<string, string>, @Body() body?: { date?: string; time?: string }) {
    return this.attendanceService.checkOut(this.ctx(headers), body);
  }

  @Get('today')
  today(@Headers() headers: Record<string, string>, @Query('date') date?: string, @Query('employeeId') employeeId?: string) {
    return this.attendanceService.todayRecord(this.ctx(headers), { date, employeeId });
  }

  @Get('monthly')
  monthly(
    @Headers() headers: Record<string, string>,
    @Query('employeeId') employeeId?: string,
    @Query('month') month?: string,
  ) {
    return this.attendanceService.monthlyAttendance(this.ctx(headers), { employeeId, month });
  }

  private ctx(headers: Record<string, string>) {
    return {
      role: (headers['x-role'] || 'employee') as AttendanceRole,
      employeeId: headers['x-employee-id'],
    };
  }
}
