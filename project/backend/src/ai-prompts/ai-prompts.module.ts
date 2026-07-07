import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AiPromptsController } from './ai-prompts.controller';
import { AiPromptsService } from './ai-prompts.service';

@Module({
  imports: [PortfolioModule],
  controllers: [AiPromptsController],
  providers: [AiPromptsService],
})
export class AiPromptsModule {}
