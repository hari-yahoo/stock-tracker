import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { BackupsService } from './backups.service';
import { CreateBackupDto } from './backups.dto';

@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  list() {
    return this.backups.list();
  }

  @Post()
  create(@Body() dto: CreateBackupDto) {
    const backup = this.backups.create(dto.label);
    return {
      name: backup.name,
      size: backup.size,
      createdAt: backup.createdAt,
    };
  }

  @Get('download')
  @Header('Content-Type', 'application/vnd.sqlite3')
  download() {
    const backup = this.backups.download();
    return new StreamableFile(backup.data, {
      type: 'application/vnd.sqlite3',
      disposition: `attachment; filename="${backup.filename}"`,
      length: backup.data.length,
    });
  }

  @Post('restore')
  restore(@Body() data: Buffer) {
    return this.backups.restore(data);
  }
}
