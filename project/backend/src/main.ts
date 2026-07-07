import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { raw, text } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    '/api/data/trades.csv',
    text({ type: ['text/csv', 'text/plain'], limit: '10mb' }),
  );
  app.use(
    '/api/backups/restore',
    raw({ type: 'application/octet-stream', limit: '250mb' }),
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
