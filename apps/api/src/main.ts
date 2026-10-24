import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './core/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: config.webOrigin });
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`API on http://localhost:${config.port}`);
}

void bootstrap();
