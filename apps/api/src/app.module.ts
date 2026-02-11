import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CoreHrModule } from './core-hr/core-hr.module';
import { AttendanceModule } from './attendance/attendance.module';

@Module({
  controllers: [HealthController],
  imports: [CoreHrModule, AttendanceModule],
})
export class AppModule {}
