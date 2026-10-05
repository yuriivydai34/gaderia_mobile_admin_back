import { BadRequestException } from '@nestjs/common';
import { DISCOUNT_TYPES, DiscountType, PromoCode } from './promo-code.entity';

export type PromoInput = Partial<
  Pick<
    PromoCode,
    | 'code'
    | 'title'
    | 'discount_type'
    | 'discount_value'
    | 'usage_limit'
    | 'starts_at'
    | 'ends_at'
    | 'first_order_only'
    | 'max_account_age_days'
    | 'is_active'
    | 'auto_apply'
  >
>;

// Letters of any alphabet, digits, - and _. What a client can type from a
// flyer without guessing.
const CODE_PATTERN = /^[\p{L}\p{N}_-]{3,32}$/u;

function fail(message: string): never {
  throw new BadRequestException(message);
}

const blank = (value: unknown) => value === undefined || value === null || value === '';

function positiveInt(value: unknown, what: string): number | null {
  if (blank(value)) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(`${what}: ціле число більше нуля`);
  return n;
}

function date(value: unknown, what: string): Date | null {
  if (blank(value)) return null;
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) fail(`${what}: некоректна дата`);
  return d;
}

/**
 * Checks and normalizes what the panel sends. `partial` is for PATCH: only the
 * fields present are checked, and the cross-field rules are checked against
 * `current` for the rest.
 */
export function normalizePromoInput(
  body: Record<string, unknown>,
  partial = false,
  current?: PromoCode,
): PromoInput {
  body = body ?? {}; // no JSON body at all: a 400 below, not a TypeError
  const out: PromoInput = {};
  const has = (field: string) => field in body;

  if (!partial || has('code')) {
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      fail('Код: від 3 до 32 символів — літери, цифри, «-» або «_», без пробілів');
    }
    out.code = code;
  }

  if (has('title')) {
    const title = String(body.title ?? '').trim();
    out.title = title === '' ? null : title;
  }

  if (!partial || has('discount_type')) {
    if (!DISCOUNT_TYPES.includes(body.discount_type as DiscountType)) {
      fail('Тип знижки: PERCENT або FIXED');
    }
    out.discount_type = body.discount_type as DiscountType;
  }

  if (!partial || has('discount_value')) {
    const value = Number(body.discount_value);
    if (!Number.isFinite(value) || value <= 0) fail('Розмір знижки має бути більше нуля');
    out.discount_value = Math.round(value * 100) / 100;
  }

  if (has('usage_limit')) out.usage_limit = positiveInt(body.usage_limit, 'Ліміт використань');
  if (has('max_account_age_days')) {
    out.max_account_age_days = positiveInt(body.max_account_age_days, 'Вік акаунта в днях');
  }
  if (has('starts_at')) out.starts_at = date(body.starts_at, 'Початок дії');
  if (has('ends_at')) out.ends_at = date(body.ends_at, 'Кінець дії');
  if (has('first_order_only')) out.first_order_only = Boolean(body.first_order_only);
  if (has('is_active')) out.is_active = Boolean(body.is_active);
  if (has('auto_apply')) out.auto_apply = Boolean(body.auto_apply);

  // Rules across fields, against what the row will look like after the save.
  const type = out.discount_type ?? current?.discount_type;
  const value = out.discount_value ?? current?.discount_value;
  if (type === 'PERCENT' && value !== undefined && value > 100) {
    fail('Відсоток знижки не може бути більше 100');
  }
  const starts = has('starts_at') ? out.starts_at : current?.starts_at;
  const ends = has('ends_at') ? out.ends_at : current?.ends_at;
  if (starts && ends && starts >= ends) fail('Кінець дії має бути пізніше за початок');

  return out;
}
