import {
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

const STOCK_SYMBOL = /^[A-Z0-9][A-Z0-9&.-]*$/i;

export class CreateInstrumentDto {
  @IsString()
  @Length(1, 32)
  symbol!: string;

  @IsString()
  @Length(1, 32)
  exchange!: string;

  @IsISO4217CurrencyCode()
  quoteCurrency!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  sector?: string;
}

export class UpdateInstrumentDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  sector?: string;
}

export class SaveIciciSymbolMappingDto {
  @IsString()
  @Length(1, 32)
  @Matches(STOCK_SYMBOL)
  iciciSymbol!: string;

  @IsString()
  @Length(1, 32)
  @Matches(STOCK_SYMBOL)
  nseSymbol!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  companyName?: string;
}
