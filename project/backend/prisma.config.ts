import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prisma config resolves this relative to the backend workspace.
    url: process.env.DATABASE_URL ?? 'file:./data/stock-tracker.db',
  },
});
