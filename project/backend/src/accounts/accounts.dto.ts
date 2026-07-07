import {
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsISO4217CurrencyCode()
  reportingCurrency?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsISO4217CurrencyCode()
  reportingCurrency?: string;
}
