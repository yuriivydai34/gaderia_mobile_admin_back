import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Banner pictures uploaded in the panel.
 *
 * Every upload is decoded and re-encoded rather than stored as it arrived.
 * That proves the bytes really are an image and drops everything else they
 * carried - EXIF, colour profiles, anything appended past the end of the
 * picture - so the folder this API serves holds only pictures it made itself.
 */

/** The path this API serves banner pictures under (main.ts). */
export const BANNER_IMAGES_ROUTE = '/banner-images';

/** Refused before decoding; a banner is a picture, not a poster print. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Wider than any phone needs; taller stays in proportion. */
const MAX_WIDTH = 2000;
const WEBP_QUALITY = 82;

/** Bump when the processing changes, so re-processed pictures get new names
 *  and nobody's cache keeps the old ones. */
const PROCESSING_VERSION = 1;

/**
 * Where banner pictures are written: next to dist/ on the server, which the
 * deploy copies over without deleting anything else.
 */
export function bannerImagesDir(): string {
  return (
    process.env.BANNER_IMAGES_DIR ||
    join(__dirname, '..', '..', 'banner-images')
  );
}

/** A stored name, as it is kept in promo_banner.image. */
const NAME = /^[0-9a-f]{32}\.webp$/;

export function isStoredImageName(value: unknown): value is string {
  return typeof value === 'string' && NAME.test(value);
}

/** The URL the app and the panel load the picture from. */
export function bannerImageUrl(name: string): string {
  return `${BANNER_IMAGES_ROUTE}/${name}`;
}

export type StoredImage = {
  name: string;
  width: number;
  height: number;
  bytes: number;
};

/**
 * Validates, normalises and stores an uploaded picture. The file name is the
 * hash of its contents, so the same picture uploaded twice is stored once and
 * a changed picture never reuses a cached URL.
 */
export async function storeBannerImage(buffer: Buffer): Promise<StoredImage> {
  if (!buffer?.length) throw new BadRequestException('Порожній файл');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new BadRequestException(
      `Картинка більша за ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ`,
    );
  }

  let processed: Buffer;
  let width: number;
  let height: number;
  try {
    const pipeline = sharp(buffer, { failOn: 'error' }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) throw new Error('no dimensions');

    const resized =
      meta.width > MAX_WIDTH ? pipeline.resize({ width: MAX_WIDTH }) : pipeline;
    const out = await resized
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    processed = out.data;
    width = out.info.width;
    height = out.info.height;
  } catch {
    // Whatever sharp failed on, to the manager it is one thing: not a picture.
    throw new BadRequestException(
      'Не вдалося прочитати картинку. Підійдуть JPEG, PNG або WebP.',
    );
  }

  const name = `${createHash('sha256')
    .update(String(PROCESSING_VERSION))
    .update(processed)
    .digest('hex')
    .slice(0, 32)}.webp`;

  const dir = bannerImagesDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), processed);

  return { name, width, height, bytes: processed.length };
}

/**
 * Removes a stored picture. Never throws: a banner is gone either way, and a
 * leftover file is a far smaller problem than a failed delete.
 */
export async function removeBannerImage(
  name: string | null | undefined,
): Promise<void> {
  if (!isStoredImageName(name)) return;
  try {
    await unlink(join(bannerImagesDir(), name));
  } catch {
    /* already gone, or still referenced by another banner */
  }
}
