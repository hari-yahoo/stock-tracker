import { Body, Controller, Post } from '@nestjs/common';
import { GeneratePromptDto } from './ai-prompts.dto';
import { AiPromptsService } from './ai-prompts.service';

@Controller('ai-prompts')
export class AiPromptsController {
  constructor(private readonly prompts: AiPromptsService) {}

  @Post('generate')
  generate(@Body() dto: GeneratePromptDto) {
    return this.prompts.generate(dto);
  }
}
