import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CreateTradeDto, TradeQueryDto } from './trades.dto';
import { TradesService } from './trades.service';

@Controller('trades')
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  list(@Query() query: TradeQueryDto) {
    return this.trades.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.trades.get(id);
  }

  @Post()
  create(@Body() dto: CreateTradeDto) {
    return this.trades.create(dto);
  }

  @Post(':id/void')
  void(@Param('id', ParseUUIDPipe) id: string) {
    return this.trades.void(id);
  }
}
