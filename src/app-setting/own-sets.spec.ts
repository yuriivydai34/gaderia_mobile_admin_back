import { BadRequestException } from '@nestjs/common';
import { DEFAULT_PACK_RULES, normalizeOwnSetsMode, normalizePackRules, normalizeTesters } from './own-sets';
import { defaultAppSettings, normalizeAppSettingsInput, readStoredValue } from './app-setting-input';

const rule = (over: Record<string, unknown> = {}) => ({
  measurement: 1,
  n: 6,
  label: 'Сік 1 л',
  msg: 'Додайте ще {N}',
  enabled: true,
  ...over,
});

describe('juices by the bottle', () => {
  it('is off by default, with the website rules, and no testers', () => {
    const d = defaultAppSettings();
    expect(d.own_sets_mode).toBe('off');
    expect(d.own_sets_testers).toEqual([]);
    expect(d.pack_rules).toEqual(DEFAULT_PACK_RULES);
    // A copy: changing it does not change the next default.
    d.pack_rules[0].n = 99;
    expect(defaultAppSettings().pack_rules[0].n).toBe(12);
  });

  it('takes only the three modes', () => {
    for (const m of ['off', 'testers', 'on']) expect(normalizeOwnSetsMode(m)).toBe(m);
    for (const m of ['On', true, '', null]) expect(() => normalizeOwnSetsMode(m)).toThrow(BadRequestException);
  });

  it('takes tester ids as numbers or text, without duplicates', () => {
    expect(normalizeTesters([129, '42', 129])).toEqual([129, 42]);
    for (const v of [['abc'], [0], [-1], [1.5], 'oops']) expect(() => normalizeTesters(v)).toThrow(BadRequestException);
    expect(() => normalizeTesters(Array.from({ length: 51 }, (_, i) => i + 1))).toThrow(/50/);
  });

  it('checks rules: volume, bottles in a box, texts, one rule per volume', () => {
    expect(normalizePackRules([rule({ label: '  Сік  1 л ' })])).toEqual([{ ...rule(), label: 'Сік 1 л' }]);
    for (const over of [{ measurement: 0 }, { n: 0 }, { n: 1.5 }, { n: 101 }, { label: '' }, { msg: 'x'.repeat(201) }, { enabled: 'yes' }]) {
      expect(() => normalizePackRules([rule(over)])).toThrow(BadRequestException);
    }
    expect(() => normalizePackRules([rule(), rule()])).toThrow(/уже є/);
  });

  it('goes through the settings; a broken stored value reads as missing', () => {
    expect(normalizeAppSettingsInput({ own_sets_mode: 'testers', own_sets_testers: ['129'] })).toEqual({
      own_sets_mode: 'testers',
      own_sets_testers: [129],
    });
    expect(readStoredValue('own_sets_mode', 'maybe')).toBeUndefined();
    expect(readStoredValue('pack_rules', [rule({ n: 0 })])).toBeUndefined();
    expect(readStoredValue('own_sets_testers', [129])).toEqual([129]);
  });
});

describe('ready-made mixes', () => {
  const m = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    name: 'Мікс «Груша + Полуниця»',
    measurement: 3,
    items: [
      { juice: 'PEARAPPLE', qty: 1 },
      { juice: 'STRAWBERRYAPPLE', qty: 1 },
    ],
    enabled: true,
    ...over,
  });

  it('starts with the two of the website, each filling its box', () => {
    const d = defaultAppSettings();
    expect(d.pack_mixes).toHaveLength(2);
    expect(d.pack_mixes.map((x) => x.name)).toEqual(['Набір 1', 'Набір 2']);
    expect(() => normalizeAppSettingsInput({ pack_mixes: d.pack_mixes })).not.toThrow();
  });

  it('takes a mix that fills the box exactly', () => {
    expect(normalizeAppSettingsInput({ pack_mixes: [m()] }).pack_mixes).toEqual([m()]);
  });

  it.each([
    ['one bottle short', { items: [{ juice: 'PEARAPPLE', qty: 1 }] }],
    ['one too many', { items: [{ juice: 'PEARAPPLE', qty: 2 }, { juice: 'APPLE', qty: 1 }] }],
    ['an unknown flavour', { items: [{ juice: 'PEARAPPLE', qty: 1 }, { juice: 'BANANA', qty: 1 }] }],
    ['a flavour twice', { items: [{ juice: 'PEARAPPLE', qty: 1 }, { juice: 'PEARAPPLE', qty: 1 }] }],
    ['no flavours', { items: [] }],
    ['a volume with no box rule', { measurement: 5 }],
    ['no name', { name: ' ' }],
    ['a bad id', { id: 'a b' }],
    ['enabled as text', { enabled: 'yes' }],
  ])('refuses %s', (_, over) => {
    expect(() => normalizeAppSettingsInput({ pack_mixes: [m(over)] })).toThrow(BadRequestException);
  });

  it('refuses two mixes with one id', () => {
    expect(() => normalizeAppSettingsInput({ pack_mixes: [m(), m()] })).toThrow(BadRequestException);
  });

  it('checks the mix against the box rules sent in the same request', () => {
    const rules = [{ measurement: 3, n: 3, label: 'Сік 3 л', msg: '{N}', enabled: true }];
    expect(() => normalizeAppSettingsInput({ pack_rules: rules, pack_mixes: [m()] })).toThrow(/у коробці 3/);
  });

  it('an empty list is fine: the mixes were removed on purpose', () => {
    expect(normalizeAppSettingsInput({ pack_mixes: [] })).toEqual({ pack_mixes: [] });
  });
});
