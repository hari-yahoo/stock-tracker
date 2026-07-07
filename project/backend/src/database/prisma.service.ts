import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const backendRoot = join(__dirname, '..', '..');

function databasePath(url: string): string {
  if (!url.startsWith('file:')) {
    throw new Error('Backup and restore require a local SQLite file URL');
  }
  const path = decodeURIComponent(url.slice('file:'.length));
  // Match prisma.config.ts: relative file URLs use the backend workspace,
  // regardless of whether Nest is running from src or dist.
  return isAbsolute(path) ? path : resolve(backendRoot, path);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  readonly databaseFilePath: string;

  constructor() {
    const configuredUrl =
      process.env.DATABASE_URL ?? 'file:./data/stock-tracker.db';
    const filePath = databasePath(configuredUrl);
    mkdirSync(dirname(filePath), { recursive: true });
    const url = `file:${filePath}`;
    super({
      adapter: new PrismaBetterSqlite3({ url }),
    });
    this.databaseFilePath = filePath;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
