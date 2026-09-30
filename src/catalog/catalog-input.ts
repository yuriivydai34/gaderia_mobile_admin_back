import { BadRequestException } from '@nestjs/common';
import { Catalog } from './catalog.entity';

// The codes the mobile app (lib/config/enum.dart) and app-server
// (enum_declare.js) understand. A product stored with anything else is
// invisible to the app's filters — the pear vinegar with type_juice "PEAR"
// and no type_vinegar was exactly that. The panel's choices live in
// nextjs-app-orders-front/app/lib/product-types.ts and juice-types.ts.
export const PRODUCT_TYPES = ['JUICE', 'VINEGAR', 'APPLE'] as const;
export const JUICE_TYPES = [
  'APPLE', 'APPLEGRAPE', 'CARROTAPPLE', 'PEARAPPLE', 'STRAWBERRYAPPLE',
  'APPLEGINGER', 'APPLELEMON', 'APPLEBERRY',
] as const;
export const VINEGAR_TYPES = ['FILTERED', 'UNFILTERED', 'BALSAMIC'] as const;
export const APPLE_TYPES = [
  'REDJONAPRINCE', 'MODI', 'IDARED', 'FLORINA', 'FUJI', 'GALA',
  'GOLDENDELICIOUS', 'REDCHIEF', 'GRANNYSMITH',
] as const;
export const PACKAGING_TYPES = ['GLASS', 'BAGINBOX'] as const;
export const MEASUREMENT_TYPES = ['LITER', 'KG'] as const;

// Each kind of product has exactly one type field; the other two are cleared.
const SUBTYPE = {
  JUICE: { field: 'type_juice', values: JUICE_TYPES, label: 'Смак соку' },
  VINEGAR: { field: 'type_vinegar', values: VINEGAR_TYPES, label: 'Вид оцту' },
  APPLE: { field: 'type_apple', values: APPLE_TYPES, label: 'Сорт яблук' },
} as const;
const SUBTYPE_FIELDS = ['type_juice', 'type_vinegar', 'type_apple'] as const;

export type CatalogInput = Partial<
  Pick<
    Catalog,
    | 'header' | 'description' | 'article' | 'picture'
    | 'price' | 'is_discount' | 'price_discount'
    | 'measurement' | 'type_measurement' | 'type_product' | 'type_packaging'
    | 'type_juice' | 'type_vinegar' | 'type_apple'
    | 'shipment_length' | 'shipment_width' | 'shipment_height' | 'shipment_weight'
    | 'id_sort' | 'is_active'
  >
>;

function fail(message: string): never {
  throw new BadRequestException(message);
}

const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

function code(v: unknown): string | null {
  return blank(v) ? null : String(v);
}

function text(v: unknown): string | null {
  return blank(v) ? null : String(v).trim();
}

function number(v: unknown, what: string, { positive = false, optional = false } = {}): number | null {
  if (blank(v)) {
    if (optional) return null;
    fail(`${what}: обов'язкове поле`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (positive && n === 0)) {
    fail(`${what}: ${positive ? 'більше нуля' : 'не менше нуля'}`);
  }
  return n;
}

function oneOf<T extends string>(v: unknown, values: readonly T[], what: string): T {
  if (!values.includes(v as T)) fail(`${what}: невідоме значення «${String(v)}»`);
  return v as T;
}

/**
 * Checks and normalizes a product from the panel. `partial` is for PATCH:
 * only the fields sent are checked, and the rules across fields are checked
 * against `current` for the rest (the sort dialog sends id_sort alone).
 */
export function normalizeCatalogInput(
  body: Record<string, unknown>,
  partial = false,
  current?: Catalog,
): CatalogInput {
  body = body ?? {}; // no JSON body at all: a 400 below, not a TypeError
  const out: CatalogInput = {};
  const has = (f: string) => !partial || f in body;

  if (has('header')) {
    out.header = text(body.header);
    if (!out.header) fail("Назва: обов'язкове поле");
  }
  if ('description' in body) out.description = text(body.description);
  if ('article' in body) out.article = text(body.article);
  if ('picture' in body) out.picture = text(body.picture);

  if (has('price')) out.price = number(body.price, 'Ціна', { positive: true });
  if (has('measurement')) out.measurement = number(body.measurement, 'Міра', { positive: true });
  if (has('type_measurement')) out.type_measurement = oneOf(body.type_measurement, MEASUREMENT_TYPES, 'Одиниця');
  if (has('type_packaging')) out.type_packaging = oneOf(body.type_packaging, PACKAGING_TYPES, 'Пакування');
  if (has('type_product')) out.type_product = oneOf(body.type_product, PRODUCT_TYPES, 'Тип товару');

  for (const f of ['shipment_length', 'shipment_width', 'shipment_height', 'shipment_weight'] as const) {
    if (has(f)) out[f] = number(body[f], 'Габарити й вага', { positive: true });
  }
  if ('id_sort' in body) out.id_sort = number(body.id_sort, 'Порядок') as number;
  if ('is_active' in body) out.is_active = Boolean(body.is_active);

  // The type field that belongs to the product's kind; the others are
  // cleared whenever the kind or a type field is sent, so a vinegar cannot
  // keep a juice flavour.
  const kind = (out.type_product ?? current?.type_product) as keyof typeof SUBTYPE | undefined;
  if ('type_product' in out || SUBTYPE_FIELDS.some((f) => f in body)) {
    const sub = kind ? SUBTYPE[kind] : undefined;
    for (const f of SUBTYPE_FIELDS) out[f] = null;
    if (sub) {
      const value = code(body[sub.field] ?? (partial ? current?.[sub.field] : undefined));
      if (value === null) fail(`${sub.label}: оберіть значення`);
      out[sub.field] = oneOf(value, sub.values as readonly string[], sub.label);
    }
  }

  // price_discount is the sale price in hryvnias (create_payment charges it
  // instead of price), not a percent.
  if ('is_discount' in body || 'price_discount' in body || 'price' in out) {
    const onSale = 'is_discount' in body ? Boolean(body.is_discount) : Boolean(current?.is_discount);
    if ('is_discount' in body) out.is_discount = onSale;
    if (onSale) {
      const salePrice = number(
        'price_discount' in body ? body.price_discount : current?.price_discount,
        'Ціна зі знижкою',
        { positive: true },
      ) as number;
      const price = out.price ?? current?.price;
      if (price != null && salePrice >= price) fail('Ціна зі знижкою має бути меншою за звичайну');
      out.price_discount = salePrice;
    } else if ('is_discount' in body) {
      out.price_discount = 0;
    }
  }

  return out;
}
