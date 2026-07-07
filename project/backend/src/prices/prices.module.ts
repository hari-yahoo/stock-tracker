import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { ZerodhaPriceProvider } from './zerodha-price-provider';

@Module({
  imports: [PortfolioModule],
  controllers: [PricesController],
  providers: [PricesService, ZerodhaPriceProvider],
})
export class PricesModule {}
