import { Type } from 'class-transformer';
import {
  IsISO4217CurrencyCode,
  IsISO8601,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class PortfolioQueryDto {
  @IsOptional()
  @IsISO8601()
  asOf?: string;

  @IsOptional()
  @IsISO4217CurrencyCode()
  reportingCurrency?: string;
}

export class PortfolioHistoryQueryDto {
  @IsOptional()
  @IsISO4217CurrencyCode()
  reportingCurrency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(180)
  limit?: number;
}
