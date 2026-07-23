import { ExitPlanStatus } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

const DECIMAL = /^\d+(?:\.\d{1,6})?$/;

export class CreateExitPlanDto {
  @IsUUID()
  instrumentId!: string;

  @Matches(DECIMAL)
  targetPrice!: string;

  @IsISO8601()
  targetDate!: string;

  @IsString()
  @Length(1, 5000)
  rationale!: string;
}

export class UpdateExitPlanDto {
  @IsOptional()
  @Matches(DECIMAL)
  targetPrice?: string;

  @IsOptional()
  @IsISO8601()
  targetDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  rationale?: string;

  @IsOptional()
  @IsEnum(ExitPlanStatus)
  status?: ExitPlanStatus;
}

export class ExitPlanQueryDto {
  @IsOptional()
  @IsEnum(ExitPlanStatus)
  status?: ExitPlanStatus;
}
