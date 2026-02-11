import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CoreHrModule } from './core-hr/core-hr.module';

@Module({
  controllers: [HealthController],
  imports: [CoreHrModule],
})
export class AppModule {}
