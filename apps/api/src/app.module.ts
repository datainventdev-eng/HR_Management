import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CoreHrModule } from './core-hr/core-hr.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { TimesheetModule } from './timesheet/timesheet.module';
import { PayrollModule } from './payroll/payroll.module';
import { RecruitmentModule } from './recruitment/recruitment.module';

@Module({
  controllers: [HealthController],
  imports: [CoreHrModule, AttendanceModule, LeaveModule, TimesheetModule, PayrollModule, RecruitmentModule],
})
export class AppModule {}
