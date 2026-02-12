import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CoreHrModule } from './core-hr/core-hr.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { TimesheetModule } from './timesheet/timesheet.module';
import { PayrollModule } from './payroll/payroll.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { DocumentsModule } from './documents/documents.module';
import { ReportsModule } from './reports/reports.module';
import { OpsModule } from './ops/ops.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  controllers: [HealthController],
  imports: [
    CoreHrModule,
    AttendanceModule,
    LeaveModule,
    TimesheetModule,
    PayrollModule,
    RecruitmentModule,
    DocumentsModule,
    ReportsModule,
    OpsModule,
    DashboardModule,
  ],
})
export class AppModule {}
