import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateExitPlanDto,
  ExitPlanQueryDto,
  UpdateExitPlanDto,
} from './exit-plans.dto';
import { ExitPlansService } from './exit-plans.service';

@Controller('exit-plans')
export class ExitPlansController {
  constructor(private readonly plans: ExitPlansService) {}

  @Get()
  list(@Query() query: ExitPlanQueryDto) {
    return this.plans.list(query.status);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.get(id);
  }

  @Post()
  create(@Body() dto: CreateExitPlanDto) {
    return this.plans.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExitPlanDto,
  ) {
    return this.plans.update(id, dto);
  }

  @Delete(':id')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.cancel(id);
  }
}
