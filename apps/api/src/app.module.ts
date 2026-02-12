import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CoreHrModule } from './core-hr/core-hr.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { TimesheetModule } from './timesheet/timesheet.module';
import { PayrollModule } from './payroll/payroll.module';

@Module({
  controllers: [HealthController],
  imports: [CoreHrModule, AttendanceModule, LeaveModule, TimesheetModule, PayrollModule],
})
export class AppModule {}
