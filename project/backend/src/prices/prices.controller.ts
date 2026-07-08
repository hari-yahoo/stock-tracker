import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateFxRateDto,
  CreatePriceDto,
  FxRateQueryDto,
  PriceQueryDto,
} from './prices.dto';
import { PricesService } from './prices.service';

@Controller('prices')
export class PricesController {
  constructor(private readonly prices: PricesService) {}

  @Get()
  list(@Query() query: PriceQueryDto) {
    return this.prices.list(query.instrumentId);
  }

  @Get('latest')
  latest(@Query() query: PriceQueryDto) {
    if (!query.instrumentId) {
      throw new BadRequestException('instrumentId is required');
    }
    return this.prices.latest(query.instrumentId);
  }

  @Get('fx')
  listFx(@Query() query: FxRateQueryDto) {
    return this.prices.listFx(query);
  }

  @Get('refresh/eod')
  refreshStatus() {
    return this.prices.getRefreshStatus();
  }

  @Post('fx')
  createFx(@Body() dto: CreateFxRateDto) {
    return this.prices.createFx(dto);
  }

  @Post('refresh/eod')
  refreshEndOfDayPrices() {
    return this.prices.refreshEndOfDayPrices('MANUAL');
  }

  @Post('refresh/ltp')
  refreshLatestTradedPrices() {
    return this.prices.refreshEndOfDayPrices('MANUAL');
  }

  @Post()
  create(@Body() dto: CreatePriceDto) {
    return this.prices.create(dto);
  }
}
