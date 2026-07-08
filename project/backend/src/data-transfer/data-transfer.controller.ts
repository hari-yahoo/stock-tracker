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
  importTrades(
    @Body() body: { csv: string },
    @Query('dryRun') dryRun = 'false',
  ) {
    if (dryRun !== 'true' && dryRun !== 'false') {
      throw new BadRequestException('dryRun must be true or false');
    }
    return this.transfer.importTrades(body.csv, dryRun === 'true');
  }

  @Post('testimport')
  testImportTrades(@Body() body: { data: string }) {
    console.log('Test importing trades:', body);
    return 'Test import successful. Data length: ' + body.data;
  }

  @Post('icici-direct.csv')
  importIciciDirectTrades(
    @Body() body: { csv: string },
    @Query('dryRun') dryRun = 'false',
  ) {
    if (dryRun !== 'true' && dryRun !== 'false') {
      throw new BadRequestException('dryRun must be true or false');
    }
    //console.log('Importing ICICI Direct trades:', body.csv, dryRun);
    return this.transfer.importIciciDirectTrades(body.csv, dryRun === 'true');
  }

  @Post('zerodha-holdings.csv')
  importZerodhaHoldings(
    @Body() body: { csv: string },
    @Query('dryRun') dryRun = 'false',
  ) {
    if (dryRun !== 'true' && dryRun !== 'false') {
      throw new BadRequestException('dryRun must be true or false');
    }
    return this.transfer.importZerodhaHoldings(body.csv, dryRun === 'true');
  }
}
