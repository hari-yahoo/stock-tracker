import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // SQLite file URLs are resolved relative to prisma/schema.prisma.
    url: process.env.DATABASE_URL ?? 'file:../data/stock-tracker.db',
  },
});
