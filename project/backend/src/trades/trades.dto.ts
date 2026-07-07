import { TradeSide, TradeStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

const DECIMAL = /^\d+(?:\.\d{1,6})?$/;

export class SellAllocationDto {
  @IsUUID()
  openingTradeId!: string;

  @Matches(DECIMAL)
  quantity!: string;
}

export class CreateTradeDto {
  @IsUUID()
  accountId!: string;

  @IsUUID()
  instrumentId!: string;

  @IsEnum(TradeSide)
  side!: TradeSide;

  @Matches(DECIMAL)
  quantity!: string;

  @Matches(DECIMAL)
  price!: string;

  @IsOptional()
  @Matches(DECIMAL)
  fees?: string;

  @IsISO8601()
  executedAt!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  externalReference?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SellAllocationDto)
  allocations?: SellAllocationDto[];
}

export class TradeQueryDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  instrumentId?: string;

  @IsOptional()
  @IsEnum(TradeStatus)
  status?: TradeStatus;
}
