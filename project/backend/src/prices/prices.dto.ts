import {
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
