import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/**
 * A label drawn onto a product's picture, the way the website shows one: text
 * and colour set per product ("Лейбл" and "Колір лейблу" in wp-admin), white
 * text on a label flush with the left edge, rounded on the right.
 *
 * Drawn into the picture itself, not by the app, so a badge reaches every user
 * at once without a new release of the mobile app. The cost is that it shows
 * wherever the picture does - the catalog, the product page, the basket.
 */
export type Badge = { text: string; color: string };

export const DEFAULT_BADGE_COLOR = '#ff2121';
// Longer text would run across the product itself.
export const BADGE_MAX_LENGTH = 20;
export const BADGE_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// Pango markup: the text is the manager's, so <, > and & must stay literal.
function escapeMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Bump when the drawing changes, so every badged picture gets a new file name
// and the app's image cache does not keep the old look.
const DRAWING_VERSION = 1;

const FONT_FILE = join(__dirname, 'assets', 'Montserrat-Bold.ttf');
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

/** The path this API serves badged pictures under (main.ts). */
export const BADGE_PICTURES_ROUTE = '/badge-pictures';

/**
 * Where badged pictures are written: next to dist/ on the server, which the
 * deploy copies over without deleting anything else.
 */
export function badgePicturesDir(): string {
  return process.env.BADGE_PICTURES_DIR || join(__dirname, '..', '..', 'badge-pictures');
}

/**
 * The public address of that folder. The app loads pictures itself and iOS
 * refuses plain http, so this is the https name nginx gives this API, not the
 * bare IP and port the panel calls.
 */
function badgePicturesUrl(): string {
  return (process.env.BADGE_PICTURES_URL || `https://api.gaderia.com.ua${BADGE_PICTURES_ROUTE}`).replace(/\/+$/, '');
}

/** True for a picture this module wrote, so it is never badged twice. */
export function isBadgedPicture(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith(`${badgePicturesUrl()}/`));
}

async function fetchPicture(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new BadRequestException('Не вдалося завантажити картинку товару для бейджа');
  }
  if (!res.ok) {
    throw new BadRequestException(`Картинка товару недоступна (${res.status})`);
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_SOURCE_BYTES) {
    throw new BadRequestException('Картинка товару завелика для бейджа');
  }
  return body;
}

/** The label alone, sized for a picture `width` pixels wide. */
async function drawLabel(badge: Badge, width: number): Promise<{ png: Buffer; height: number }> {
  const { text, color } = badge;
  const height = Math.max(24, Math.round(width * 0.085));
  const fontPx = Math.round(height * 0.5);

  const label = await sharp({
    text: {
      text: `<span foreground="#ffffff">${escapeMarkup(text)}</span>`,
      font: `Montserrat Bold ${fontPx}px`,
      fontfile: FONT_FILE,
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });

  const padLeft = Math.round(height * 0.45);
  const padRight = Math.round(height * 0.55);
  const labelWidth = padLeft + label.info.width + padRight;
  const r = height / 2;

  // Square on the left, where it meets the picture's edge; round on the right.
  const shape = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth}" height="${height}">` +
      `<path d="M0 0 H${labelWidth - r} A${r} ${r} 0 0 1 ${labelWidth - r} ${height} H0 Z" fill="${color}"/>` +
      `</svg>`,
  );

  const png = await sharp(shape)
    .composite([
      {
        input: label.data,
        left: padLeft,
        top: Math.max(0, Math.round((height - label.info.height) / 2)),
      },
    ])
    .png()
    .toBuffer();
  return { png, height };
}

/** The picture at `source` with the badge drawn in its top-left corner. */
export async function renderBadgedPicture(
  source: string,
  badge: Badge,
): Promise<{ data: Buffer; ext: 'jpg' | 'png' | 'webp' }> {
  const original = await fetchPicture(source);
  let image = sharp(original).rotate(); // honour EXIF orientation before measuring
  const meta = await image.metadata().catch(() => {
    throw new BadRequestException('За посиланням не картинка');
  });
  if (!meta.width || !meta.height) throw new BadRequestException('За посиланням не картинка');
  const width = meta.autoOrient?.width ?? meta.width;

  const label = await drawLabel(badge, width);
  image = image.composite([{ input: label.png, left: 0, top: Math.round(width * 0.05) }]);

  // Keep the source's format: transparent product shots stay transparent.
  if (meta.format === 'png') return { data: await image.png().toBuffer(), ext: 'png' };
  if (meta.format === 'webp') return { data: await image.webp({ quality: 90 }).toBuffer(), ext: 'webp' };
  return { data: await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer(), ext: 'jpg' };
}

/**
 * Draws the badge and stores the result, returning its public address. The
 * name comes from the source and badge, so saving the same product again
 * rewrites the same file rather than piling up copies.
 */
export async function storeBadgedPicture(source: string, badge: Badge): Promise<string> {
  const dir = badgePicturesDir();
  const publicUrl = badgePicturesUrl();
  const { data, ext } = await renderBadgedPicture(source, badge);
  const name = createHash('sha256')
    .update(`${DRAWING_VERSION}|${badge.text}|${badge.color.toLowerCase()}|${source}`)
    .digest('hex')
    .slice(0, 20);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.${ext}`), data);
  return `${publicUrl}/${name}.${ext}`;
}
