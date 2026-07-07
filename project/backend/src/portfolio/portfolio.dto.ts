import { IsISO4217CurrencyCode, IsISO8601, IsOptional } from 'class-validator';

export class PortfolioQueryDto {
  @IsOptional()
  @IsISO8601()
  asOf?: string;

  @IsOptional()
  @IsISO4217CurrencyCode()
  reportingCurrency?: string;
}
