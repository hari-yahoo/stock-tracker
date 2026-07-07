import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountsModule } from './accounts/accounts.module';
import { AiPromptsModule } from './ai-prompts/ai-prompts.module';
import { BackupsModule } from './backups/backups.module';
import { DatabaseModule } from './database/database.module';
import { DataTransferModule } from './data-transfer/data-transfer.module';
import { ExitPlansModule } from './exit-plans/exit-plans.module';
import { InstrumentsModule } from './instruments/instruments.module';
import { PricesModule } from './prices/prices.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { TradesModule } from './trades/trades.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'), // backend/dist/../public → backend/public
      exclude: ['/api/{*splat}'],
    }),
    DatabaseModule,
    AccountsModule,
    InstrumentsModule,
    TradesModule,
    PricesModule,
    ExitPlansModule,
    PortfolioModule,
    DataTransferModule,
    BackupsModule,
    AiPromptsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
