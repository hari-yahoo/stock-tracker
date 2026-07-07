import {
  IsISO4217CurrencyCode,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class GeneratePromptDto {
  @IsOptional()
  @IsISO4217CurrencyCode()
  reportingCurrency?: string;

  @IsOptional()
  @IsISO8601()
  asOf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  additionalInstructions?: string;
}
