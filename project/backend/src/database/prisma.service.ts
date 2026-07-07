import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { join } from 'node:path';

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    `file:${join(__dirname, '..', '..', 'data', 'stock-tracker.db')}`
  );
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaBetterSqlite3({ url: databaseUrl() }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
