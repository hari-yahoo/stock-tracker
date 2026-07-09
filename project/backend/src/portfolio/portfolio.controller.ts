import { Controller, Get, Query } from '@nestjs/common';
import { PortfolioHistoryQueryDto, PortfolioQueryDto } from './portfolio.dto';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  snapshot(@Query() query: PortfolioQueryDto) {
    return this.portfolio.snapshot(query);
  }

  @Get('summary')
  async summary(@Query() query: PortfolioQueryDto) {
    return (await this.portfolio.snapshot(query)).summary;
  }

  @Get('holdings')
  async holdings(@Query() query: PortfolioQueryDto) {
    return (await this.portfolio.snapshot(query)).holdings;
  }

  @Get('history')
  history(@Query() query: PortfolioHistoryQueryDto) {
    return this.portfolio.history(query);
  }

  @Get('alerts')
  async alerts(@Query() query: PortfolioQueryDto) {
    const snapshot = await this.portfolio.snapshot(query);
    return { alerts: snapshot.alerts, warnings: snapshot.warnings };
  }
}
