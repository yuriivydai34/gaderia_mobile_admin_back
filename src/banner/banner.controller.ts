import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { BannerService } from './banner.service';
import { MAX_UPLOAD_BYTES } from './banner-image';

/** The few fields of multer's file this code uses, so the build does not need
 *  @types/multer for one shape. */
type UploadedImage = { buffer: Buffer; size: number; mimetype: string };

const upload = () =>
  UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  );

/**
 * The promotions carousel.
 *
 * Pictures arrive as multipart, so the fields beside them are strings -
 * banner-input.ts reads "false" and "" as what the panel meant.
 *
 * Not "/banners": ad blockers' generic filter lists block any URL containing
 * that word, on any domain - this is what made the panel's own "Акції" tab
 * fail to load (24.10.2026).
 */
@Controller('promotions')
export class BannerController {
  constructor(private readonly banners: BannerService) {}

  /**
   * What the app shows right now. Unauthenticated: banners are public the
   * moment they are switched on, and a carousel that needs a token is a
   * carousel app-server has to carry credentials for.
   */
  @Get('active')
  active() {
    return this.banners.findActive();
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  findAll() {
    return this.banners.findAll();
  }

  /** Declared before ':id' so "reorder" is read as a word, not an id. */
  @Patch('reorder')
  @UseGuards(JwtAuthGuard, AdminGuard)
  reorder(@Body() body: { ids?: unknown }) {
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
    if (
      ids.length === 0 ||
      ids.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      throw new BadRequestException('Порядок: очікується список id банерів');
    }
    return this.banners.reorder(ids);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.banners.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @upload()
  create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() image?: UploadedImage,
  ) {
    if (!image?.buffer?.length)
      throw new BadRequestException('Додайте картинку банера');
    return this.banners.create(body, image.buffer);
  }

  /** The picture is optional here: editing a title should not make a manager
   *  find and upload the same file again. */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @upload()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @UploadedFile() image?: UploadedImage,
  ) {
    return this.banners.update(
      id,
      body,
      image?.buffer?.length ? image.buffer : undefined,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.banners.remove(id);
  }
}
