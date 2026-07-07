import { Module } from '@nestjs/common';
import { DataTransferController } from './data-transfer.controller';
import { DataTransferService } from './data-transfer.service';

@Module({
  controllers: [DataTransferController],
  providers: [DataTransferService],
})
export class DataTransferModule {}
