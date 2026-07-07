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

  @Post('fx')
  createFx(@Body() dto: CreateFxRateDto) {
    return this.prices.createFx(dto);
  }

  @Post()
  create(@Body() dto: CreatePriceDto) {
    return this.prices.create(dto);
  }
}
