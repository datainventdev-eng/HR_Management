import { Module } from '@nestjs/common';
import { CoreHrController } from './core-hr.controller';
import { CoreHrService } from './core-hr.service';

@Module({
  controllers: [CoreHrController],
  providers: [CoreHrService],
})
export class CoreHrModule {}
