import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { dirname } from 'node:path';
import { isAbsolute, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

function databaseUrl(): string {
  const dbPath =
    process.env.DATABASE_URL ??
    `file:${join(__dirname, '..', '..', 'data', 'stock-tracker.db')}`;

  // Ensure the directory exists for the database file
  if (dbPath.startsWith('file:')) {
    const filePath = dbPath.replace('file:', '');
    const dirPath = dirname(filePath);
    mkdirSync(dirPath, { recursive: true });
  }

  return dbPath;
}

function databasePath(url: string): string {
  if (!url.startsWith('file:')) {
    throw new Error('Backup and restore require a local SQLite file URL');
  }
  const path = decodeURIComponent(url.slice('file:'.length));
  return isAbsolute(path) ? path : resolve(path);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  readonly databaseFilePath: string;

  constructor() {
    const url = databaseUrl();
    super({
      adapter: new PrismaBetterSqlite3({ url }),
    });
    this.databaseFilePath = databasePath(url);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
