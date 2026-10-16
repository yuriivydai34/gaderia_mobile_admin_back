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
  enabled: boolean;
};

export const OWN_SETS_TESTERS_MAX = 50;
export const PACK_RULES_MAX = 20;

// What the website uses now (inc/pack-rules.php, gdr_pack_rules()).
export const DEFAULT_PACK_RULES: PackRule[] = [
  { measurement: 0.33, n: 12, label: 'Сік 0,33 л', msg: 'Сік 0,33 л їде ящиками по 12 пляшок. Додайте ще {N} — смаки можна різні.', enabled: true },
  { measurement: 1, n: 6, label: 'Сік 1 л', msg: 'Сік 1 л їде ящиками по 6 пляшок. Додайте ще {N} — смаки можна різні.', enabled: true },
  { measurement: 3, n: 2, label: 'Сік 3 л', msg: 'Сік 3 л їде упаковками по 2. Додайте ще {N} — смаки можна різні.', enabled: true },
  { measurement: 0.5, n: 2, label: 'Оцет 0,5 л', msg: 'Оцет 0,5 л їде парами. Додайте ще {N} — смаки можна різні.', enabled: true },
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
    return { measurement, n, label, msg, enabled: b.enabled };
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
