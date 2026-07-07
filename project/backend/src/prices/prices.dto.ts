import {
  IsISO4217CurrencyCode,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

const DECIMAL = /^\d+(?:\.\d{1,6})?$/;

export class CreatePriceDto {
  @IsUUID()
  instrumentId!: string;

  @Matches(DECIMAL)
  price!: string;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  source?: string;
}

export class PriceQueryDto {
  @IsOptional()
  @IsUUID()
  instrumentId?: string;
}

export class CreateFxRateDto {
  @IsISO4217CurrencyCode()
  baseCurrency!: string;

  @IsISO4217CurrencyCode()
  quoteCurrency!: string;

  @Matches(/^\d+(?:\.\d{1,9})?$/)
  rate!: string;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  source?: string;
}

export class FxRateQueryDto {
  @IsOptional()
  @IsISO4217CurrencyCode()
  baseCurrency?: string;

  @IsOptional()
  @IsISO4217CurrencyCode()
  quoteCurrency?: string;
}
