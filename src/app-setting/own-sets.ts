import { BadRequestException } from '@nestjs/common';

// Juices by the bottle, as on the website (gaderia_wc inc/pack-rules.php):
// bottles (catalog.own_sets_role 'single') are sold one at a time but ship in
// full boxes, so app-server refuses an order whose bottles of one volume are
// not a whole number of boxes. Flavours mix: a rule counts every bottle of
// its volume together.

// 'off': bottles hidden from everyone, ready boxes shown — as before.
// 'testers': only the accounts in own_sets_testers see bottles instead of
// boxes, to try it on a real phone. 'on': everyone.
export const OWN_SETS_MODES = ['off', 'testers', 'on'] as const;
export type OwnSetsMode = (typeof OWN_SETS_MODES)[number];

export type PackRule = {
  // Volume of one bottle, litres, as catalog.measurement of the bottle.
  measurement: number;
  // Bottles in one box.
  n: number;
  label: string;
  // Shown when the box is short; {N} is how many bottles are missing.
  msg: string;
  // The caption on a bottle's card, {N} is the box size ("По 6 шт. у
  // комплекті — можна обрати різні смаки"). Absent: the app writes its own.
  hint?: string;
  // Shown above the checkout button in the cart while the box is already
  // full at least once; {FULL} is how many. Absent: the app writes its own.
  // Empty string: never show it, even when the box is full.
  fullPrefix?: string;
  enabled: boolean;
};

export const OWN_SETS_TESTERS_MAX = 50;
export const PACK_RULES_MAX = 20;

// What the website uses now (inc/pack-rules.php, gdr_pack_rules()). Must
// match app-server's own copy of these defaults (lib/components/own_sets).
export const DEFAULT_PACK_RULES: PackRule[] = [
  { measurement: 0.33, n: 12, label: 'Сік 0,3 л', msg: 'Мінімальне замовлення 12 шт. Додайте ще {N} (можна інший смак).', hint: 'По 12 шт. у комплекті — можна обрати різні смаки', fullPrefix: 'Повних комплектів: {FULL}. ', enabled: true },
  { measurement: 1, n: 6, label: 'Сік 1 л', msg: 'Мінімальне замовлення 6 шт. Додайте ще {N} (можна інший смак).', hint: 'По 6 шт. у комплекті — можна обрати різні смаки', fullPrefix: 'Повних комплектів: {FULL}. ', enabled: true },
  { measurement: 3, n: 2, label: 'Сік 3 л', msg: 'Мінімальне замовлення 2 шт. Додайте ще {N} (можна інший смак).', hint: 'По 2 шт. у комплекті — можна обрати різні смаки', fullPrefix: 'Повних комплектів: {FULL}. ', enabled: true },
  // Owner's decision 24.10.2026: no box rule for vinegar — it is sold in
  // whatever quantity, same as before this feature (the "2 пляшки" pack
  // listing is unrelated — a separate, ordinary catalog product). Removed
  // rather than disabled, so the panel's rules list does not show a dead row.
  // Texts as on the website since 29.10.2026: "комплект", "шт.", "Сік 0,3 л".
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function normalizeOwnSetsMode(value: unknown): OwnSetsMode {
  if (!OWN_SETS_MODES.includes(value as OwnSetsMode)) {
    throw new BadRequestException('Поштучний продаж: off, testers або on');
  }
  return value as OwnSetsMode;
}

/** Account ids, as numbers or text; duplicates dropped, order kept. */
export function normalizeTesters(value: unknown): number[] {
  if (!Array.isArray(value)) throw new BadRequestException('Тестувальники: має бути список id акаунтів');
  const out: number[] = [];
  for (const v of value) {
    const id = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(`Тестувальники: «${String(v)}» — не id акаунта`);
    if (!out.includes(id)) out.push(id);
  }
  if (out.length > OWN_SETS_TESTERS_MAX) {
    throw new BadRequestException(`Тестувальники: не більше ${OWN_SETS_TESTERS_MAX}`);
  }
  return out;
}

export function normalizePackRules(value: unknown): PackRule[] {
  if (!Array.isArray(value)) throw new BadRequestException('Правила кратності: має бути список');
  if (value.length > PACK_RULES_MAX) throw new BadRequestException(`Правила кратності: не більше ${PACK_RULES_MAX}`);
  const seen = new Set<number>();
  return value.map((raw, i): PackRule => {
    const r = `Правило ${i + 1}`;
    if (!raw || typeof raw !== 'object') throw new BadRequestException(`${r}: невірний формат`);
    const b = raw as Record<string, unknown>;
    const measurement = Number(b.measurement);
    if (!Number.isFinite(measurement) || measurement <= 0) throw new BadRequestException(`${r}: обсяг пляшки більше нуля`);
    if (seen.has(measurement)) throw new BadRequestException(`${r}: правило для ${measurement} л уже є`);
    seen.add(measurement);
    const n = Number(b.n);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw new BadRequestException(`${r}: у коробці від 1 до 100 пляшок`);
    const label = text(b.label);
    if (!label || label.length > 40) throw new BadRequestException(`${r}: назва від 1 до 40 символів`);
    const msg = text(b.msg);
    if (!msg || msg.length > 200) throw new BadRequestException(`${r}: повідомлення від 1 до 200 символів`);
    if (typeof b.enabled !== 'boolean') throw new BadRequestException(`${r}: «увімкнено» має бути true або false`);
    const hint = b.hint === undefined || b.hint === null ? undefined : text(b.hint);
    if (hint !== undefined && hint.length > 100) throw new BadRequestException(`${r}: підпис на картці до 100 символів`);
    const fullPrefix = b.fullPrefix === undefined || b.fullPrefix === null ? undefined : text(b.fullPrefix);
    if (fullPrefix !== undefined && fullPrefix.length > 100) throw new BadRequestException(`${r}: текст над кнопкою оформлення до 100 символів`);
    return {
      measurement, n, label, msg, enabled: b.enabled,
      ...(hint !== undefined ? { hint } : {}),
      ...(fullPrefix !== undefined ? { fullPrefix } : {}),
    };
  });
}

/** A stored value of the kind, or undefined if it is not one. */
export function readStored<T>(normalize: (v: unknown) => T, value: unknown): T | undefined {
  try {
    return normalize(value);
  } catch {
    return undefined;
  }
}
