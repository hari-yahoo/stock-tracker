import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PrismaService } from '../database/prisma.service';

const REQUIRED_TABLES = [
  'accounts',
  'instruments',
  'trades',
  'lot_allocations',
  'exit_plans',
  'price_snapshots',
  'fx_rate_snapshots',
];

function sqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function timestamp(): string {
  return new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/, 'Z');
}

@Injectable()
export class BackupsService {
  private restoring = false;

  constructor(private readonly prisma: PrismaService) {}

  list() {
    const directory = this.backupDirectory();
    mkdirSync(directory, { recursive: true });
    return readdirSync(directory)
      .filter((name) => name.endsWith('.sqlite'))
      .map((name) => {
        const stats = statSync(join(directory, name));
        return { name, size: stats.size, createdAt: stats.birthtime };
      })
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
  }

  create(label?: string) {
    const suffix = label ? `-${label}` : '';
    const name = `stock-tracker-${timestamp()}${suffix}.sqlite`;
    const path = join(this.backupDirectory(), name);
    mkdirSync(this.backupDirectory(), { recursive: true });
    this.snapshot(path);
    const stats = statSync(path);
    return { name, path, size: stats.size, createdAt: stats.birthtime };
  }

  download(): { filename: string; data: Buffer } {
    const temporary = join(
      dirname(this.prisma.databaseFilePath),
      `.download-${randomUUID()}.sqlite`,
    );
    this.snapshot(temporary);
    try {
      return {
        filename: `stock-tracker-${timestamp()}.sqlite`,
        data: readFileSync(temporary),
      };
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  async restore(data: Buffer) {
    if (this.restoring)
      throw new ConflictException('A restore is already running');
    if (
      data.length < 100 ||
      data.subarray(0, 16).toString() !== 'SQLite format 3\u0000'
    ) {
      throw new BadRequestException('File is not a SQLite database');
    }

    this.restoring = true;
    const databasePath = this.prisma.databaseFilePath;
    const staging = join(
      dirname(databasePath),
      `.restore-${randomUUID()}.sqlite`,
    );
    let rollbackPath: string | undefined;
    try {
      writeFileSync(staging, data, { flag: 'wx' });
      this.validate(staging);
      rollbackPath = this.create('pre-restore').path;

      await this.prisma.$disconnect();
      rmSync(`${databasePath}-wal`, { force: true });
      rmSync(`${databasePath}-shm`, { force: true });
      renameSync(staging, databasePath);
      await this.prisma.$connect();
      await this.prisma.account.count();

      return {
        restored: true,
        rollbackBackup: rollbackPath.split('/').at(-1),
      };
    } catch (error) {
      if (rollbackPath) {
        await this.prisma.$disconnect().catch(() => undefined);
        copyFileSync(rollbackPath, databasePath);
        await this.prisma.$connect().catch(() => undefined);
      }
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Restore failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      rmSync(staging, { force: true });
      this.restoring = false;
    }
  }

  private backupDirectory(): string {
    const databaseName = basename(
      this.prisma.databaseFilePath,
      extname(this.prisma.databaseFilePath),
    );
    return join(dirname(this.prisma.databaseFilePath), 'backups', databaseName);
  }

  private snapshot(destination: string): void {
    const database = new DatabaseSync(this.prisma.databaseFilePath);
    try {
      database.exec(`VACUUM INTO ${sqliteString(destination)}`);
    } finally {
      database.close();
    }
  }

  private validate(path: string): void {
    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(path, { readOnly: true });
      const integrity = database.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string;
      };
      if (integrity.integrity_check !== 'ok') {
        throw new Error(
          `integrity check returned ${integrity.integrity_check}`,
        );
      }
      const tables = new Set(
        (
          database
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as Array<{ name: string }>
        ).map((table) => table.name),
      );
      const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));
      if (missing.length)
        throw new Error(`missing tables: ${missing.join(', ')}`);
    } catch (error) {
      throw new BadRequestException(
        `Invalid Stock Tracker backup: ${error instanceof Error ? error.message : 'validation failed'}`,
      );
    } finally {
      database?.close();
    }
  }
}
