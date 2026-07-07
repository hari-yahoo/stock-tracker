import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { CreatePriceDto, PriceQueryDto } from './prices.dto';
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

  @Post()
  create(@Body() dto: CreatePriceDto) {
    return this.prices.create(dto);
  }
}
