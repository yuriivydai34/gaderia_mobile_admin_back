import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: ['https://next-admin.gaderia.com.ua', 'http://localhost:3000'],
  });
  app.useStaticAssets(join(__dirname, '..', 'static'), { prefix: '/static' });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
