import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
} from '@nestjs/common';
import { DataTransferService } from './data-transfer.service';

@Controller('data')
export class DataTransferController {
  constructor(private readonly transfer: DataTransferService) {}

  @Get('trades.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="stock-tracker-trades.csv"',
  )
  exportTrades() {
    return this.transfer.exportTrades();
  }

  @Post('trades.csv')
  importTrades(@Body() csv: string, @Query('dryRun') dryRun = 'false') {
    if (dryRun !== 'true' && dryRun !== 'false') {
      throw new BadRequestException('dryRun must be true or false');
    }
    return this.transfer.importTrades(csv, dryRun === 'true');
  }
}
