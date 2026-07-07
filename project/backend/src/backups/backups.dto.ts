import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateBackupDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  label?: string;
}
