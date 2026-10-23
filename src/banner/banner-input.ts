import { BadRequestException } from '@nestjs/common';
import { BANNER_TARGETS, BannerTarget, PromoBanner } from './banner.entity';

export const TITLE_MAX_LENGTH = 120;
export const URL_MAX_LENGTH = 500;

export type BannerInput = Partial<
  Pick<
    PromoBanner,
    | 'title'
    | 'target_type'
    | 'target_product_id'
    | 'target_url'
    | 'sort'
    | 'is_active'
    | 'starts_at'
    | 'ends_at'
  >
>;

function fail(message: string): never {
  throw new BadRequestException(message);
}

/**
 * The text of a field, or null if it carried none.
 *
 * Only primitives are read. JSON can put an object where a title belongs, and
 * String({}) would quietly store "[object Object]" instead of refusing it.
 */
function scalar(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

const blank = (v: unknown) => (scalar(v) ?? '').trim() === '';

function text(v: unknown, what: string, max: number): string {
  const s = scalar(v);
  if (s === null && v !== undefined && v !== null) {
    fail(`${what}: очікується текст`);
  }
  const trimmed = (s ?? '').trim();
  if (!trimmed) fail(`${what}: не може бути порожнім`);
  if (trimmed.length > max) fail(`${what}: не більше ${max} символів`);
  return trimmed;
}

/**
 * Multipart carries every field as text, so an unchecked box arrives as the
 * string "false" - which Boolean() would happily call true.
 */
function boolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = (scalar(v) ?? '').trim().toLowerCase();
  return !(
    s === '' ||
    s === 'false' ||
    s === '0' ||
    s === 'null' ||
    s === 'undefined'
  );
}

function date(v: unknown, what: string): Date | null {
  if (blank(v)) return null;
  const raw = scalar(v);
  if (raw === null) fail(`${what}: не схоже на дату`);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) fail(`${what}: не схоже на дату`);
  return d;
}

/** http(s) only: a banner must not send anyone to a javascript: or data: URL. */
function link(v: unknown): string {
  const s = text(v, 'Посилання', URL_MAX_LENGTH);
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    return fail('Посилання: має починатися з http:// або https://');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail('Посилання: дозволені лише http:// та https://');
  }
  return s;
}

/**
 * Checks what the panel sent and clears whatever the chosen target does not
 * use, so a banner never carries both a product and a link - the app would
 * have to guess which one wins.
 *
 * `create` demands the fields a banner cannot exist without; an edit touches
 * only what it sent.
 */
export function normalizeBannerInput(
  body: Record<string, unknown>,
  { create }: { create: boolean },
): BannerInput {
  const out: BannerInput = {};

  if (create || 'title' in body) {
    out.title = text(body.title, 'Назва', TITLE_MAX_LENGTH);
  }

  if (create || 'target_type' in body) {
    const value = (
      blank(body.target_type) ? 'none' : String(body.target_type)
    ) as BannerTarget;
    if (!BANNER_TARGETS.includes(value)) {
      fail('Дія: «Нічого», «Товар» або «Посилання»');
    }
    out.target_type = value;
  }

  // Read the target against what the banner will be, not only what was sent:
  // switching an existing banner to 'product' must bring a product with it.
  const target = out.target_type;
  if (target === 'product') {
    const id = Number(body.target_product_id);
    if (!Number.isInteger(id) || id <= 0)
      fail('Товар: оберіть товар для банера');
    out.target_product_id = id;
    out.target_url = null;
  } else if (target === 'link') {
    out.target_url = link(body.target_url);
    out.target_product_id = null;
  } else if (target === 'none') {
    out.target_product_id = null;
    out.target_url = null;
  }

  if ('sort' in body) {
    const n = Number(body.sort);
    if (!Number.isInteger(n)) fail('Порядок: має бути цілим числом');
    out.sort = n;
  }

  if ('is_active' in body) out.is_active = boolean(body.is_active);

  if ('starts_at' in body) out.starts_at = date(body.starts_at, 'Показувати з');
  if ('ends_at' in body) out.ends_at = date(body.ends_at, 'Показувати до');

  // Compared only when both ends are known after this change; the caller
  // merges with what is stored before calling for an edit.
  if (out.starts_at && out.ends_at && out.starts_at >= out.ends_at) {
    fail('Показувати до: має бути пізніше за «Показувати з»');
  }

  return out;
}
