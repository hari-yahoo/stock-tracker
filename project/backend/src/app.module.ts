import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'), // backend/dist/../public → backend/public
      exclude: ['/api/{*splat}'],
    }),
    // ...your feature modules
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
