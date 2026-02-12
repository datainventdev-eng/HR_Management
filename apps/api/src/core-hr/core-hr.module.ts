import { Module } from '@nestjs/common';
import { CoreHrController } from './core-hr.controller';
import { CoreHrService } from './core-hr.service';
import { OpsModule } from '../ops/ops.module';

@Module({
  imports: [OpsModule],
  controllers: [CoreHrController],
  providers: [CoreHrService],
  exports: [CoreHrService],
})
export class CoreHrModule {}
