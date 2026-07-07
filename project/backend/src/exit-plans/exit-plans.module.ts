import { Module } from '@nestjs/common';
import { ExitPlansController } from './exit-plans.controller';
import { ExitPlansService } from './exit-plans.service';

@Module({
  controllers: [ExitPlansController],
  providers: [ExitPlansService],
})
export class ExitPlansModule {}
