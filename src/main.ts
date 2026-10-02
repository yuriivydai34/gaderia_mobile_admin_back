import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { BADGE_PICTURES_ROUTE, badgePicturesDir } from './catalog/picture-badge';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://next-admin.gaderia.com.ua',
      'https://next-admin.gaderia.com.ua',
    ],
    credentials: true,
  });
  // Product pictures with a badge drawn on, for the mobile app. Only those are
  // in this folder - never put anything private here (see the order reports
  // that used to leak through /static). Names change with the content, so
  // the files can be cached for good.
  app.useStaticAssets(badgePicturesDir(), {
    prefix: BADGE_PICTURES_ROUTE,
    index: false,
    maxAge: '365d',
    immutable: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
