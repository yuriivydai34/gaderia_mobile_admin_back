import { BadRequestException } from '@nestjs/common';
import { JUICE_TYPES } from '../catalog/catalog-input';

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

// A ready-made mix, as on the website (gaderia_wc inc/pack-mixes.php): a
// shortcut that puts a whole box of different flavours in the cart in one tap.
// Not a product: the cart gets the ordinary bottles. The flavours are the
// juice codes of the bottles (catalog.type_juice), the volume is the bottle's.
export type PackMix = {
  id: string;
  name: string;
  measurement: number;
  // Bottles of each flavour; together they must fill the box of that volume.
  items: { juice: string; qty: number }[];
  enabled: boolean;
};

export const PACK_MIXES_MAX = 20;
const MIX_ID = /^[A-Za-z0-9_-]{1,40}$/;

const mix = (id: string, name: string, measurement: number, juices: string[]): PackMix => ({
  id,
  name,
  measurement,
  items: juices.map((juice) => ({ juice, qty: 1 })),
  enabled: true,
});

// The two the website starts with, ids, names and flavours as in
// gaderia_wc inc/pack-mixes.php (gdr_pack_mixes_default). The three
// three-litre ones were dropped there, so they go from here too: this list is
// what the app shows until a manager saves its own in the panel.
export const DEFAULT_PACK_MIXES: PackMix[] = [
  mix('bez-vynogradu-i-yabluchnogo', 'Набір 1', 1, ['PEARAPPLE', 'CARROTAPPLE', 'STRAWBERRYAPPLE', 'APPLEGINGER', 'APPLELEMON', 'APPLEBERRY']),
  mix('bez-morkvy-i-yagidnogo', 'Набір 2', 1, ['APPLE', 'PEARAPPLE', 'STRAWBERRYAPPLE', 'APPLEGRAPE', 'APPLEGINGER', 'APPLELEMON']),
];

export const OWN_SETS_TESTERS_MAX = 50;
export const PACK_RULES_MAX = 20;

// What the website uses now (inc/pack-rules.php, gdr_pack_rules()).
export const DEFAULT_PACK_RULES: PackRule[] = [
  { measurement: 0.33, n: 12, label: 'Сік 0,33 л', msg: 'Сік 0,33 л їде ящиками по 12 пляшок. Додайте ще {N} — смаки можна різні.', enabled: true },
  { measurement: 1, n: 6, label: 'Сік 1 л', msg: 'Сік 1 л їде ящиками по 6 пляшок. Додайте ще {N} — смаки можна різні.', enabled: true },
  { measurement: 3, n: 2, label: 'Сік 3 л', msg: 'Сік 3 л їде упаковками по 2. Додайте ще {N} — смаки можна різні.', enabled: true },
  // Owner's decision 24.10.2026: no box rule for vinegar — it is sold in
  // whatever quantity, same as before this feature (the "2 пляшки" pack
  // listing is unrelated — a separate, ordinary catalog product). Removed
  // rather than disabled, so the panel's rules list does not show a dead row.
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

/**
 * The mixes sent from the panel. A mix must fill exactly one box: the bottles
 * of its flavours add up to the box size of its volume, taken from `rules`
 * (the rules saved with it, or the stored ones).
 */
export function normalizePackMixes(value: unknown, rules: PackRule[] = DEFAULT_PACK_RULES): PackMix[] {
  if (!Array.isArray(value)) throw new BadRequestException('Мікси: має бути список');
  if (value.length > PACK_MIXES_MAX) throw new BadRequestException(`Мікси: не більше ${PACK_MIXES_MAX}`);
  const ids = new Set<string>();
  return value.map((raw, i): PackMix => {
    const r = `Мікс ${i + 1}`;
    if (!raw || typeof raw !== 'object') throw new BadRequestException(`${r}: невірний формат`);
    const b = raw as Record<string, unknown>;
    const id = text(b.id);
    if (!MIX_ID.test(id) || ids.has(id)) throw new BadRequestException(`${r}: невірний id`);
    ids.add(id);
    const name = text(b.name);
    if (!name || name.length > 60) throw new BadRequestException(`${r}: назва від 1 до 60 символів`);
    const measurement = Number(b.measurement);
    if (!Number.isFinite(measurement) || measurement <= 0) throw new BadRequestException(`${r}: обсяг пляшки більше нуля`);
    if (typeof b.enabled !== 'boolean') throw new BadRequestException(`${r}: «увімкнено» має бути true або false`);
    if (!Array.isArray(b.items) || b.items.length === 0) throw new BadRequestException(`${r}: додайте хоча б один смак`);
    const seen = new Set<string>();
    let total = 0;
    const items = b.items.map((it: unknown) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const juice = String(o.juice ?? '');
      if (!(JUICE_TYPES as readonly string[]).includes(juice)) throw new BadRequestException(`${r}: невідомий смак «${juice}»`);
      if (seen.has(juice)) throw new BadRequestException(`${r}: смак «${juice}» двічі`);
      seen.add(juice);
      const qty = Number(o.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new BadRequestException(`${r}: кількість від 1 до 100`);
      total += qty;
      return { juice, qty };
    });
    const rule = rules.find((x) => x.enabled && x.measurement === measurement);
    if (!rule) throw new BadRequestException(`${r}: для ${measurement} л немає увімкненого правила коробки`);
    if (total !== rule.n) {
      throw new BadRequestException(`${r}: у коробці ${rule.n}, а в міксі ${total}`);
    }
    return { id, name, measurement, items, enabled: b.enabled };
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
