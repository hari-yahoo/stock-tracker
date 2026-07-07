import {
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

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
