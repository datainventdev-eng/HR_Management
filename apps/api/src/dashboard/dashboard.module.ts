import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { CoreHrModule } from '../core-hr/core-hr.module';
import { LeaveModule } from '../leave/leave.module';
import { OpsModule } from '../ops/ops.module';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { TimesheetModule } from '../timesheet/timesheet.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    CoreHrModule,
    AttendanceModule,
    LeaveModule,
    RecruitmentModule,
    TimesheetModule,
    OpsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
