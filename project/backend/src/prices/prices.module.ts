import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { NsePriceProvider } from './nse-price-provider';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { ZerodhaPriceProvider } from './zerodha-price-provider';

@Module({
  imports: [PortfolioModule],
  controllers: [PricesController],
  providers: [PricesService, NsePriceProvider, ZerodhaPriceProvider],
})
export class PricesModule {}
