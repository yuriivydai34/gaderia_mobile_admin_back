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

describe('the caption on a bottle card (hint)', () => {
  const rule = (over: Record<string, unknown> = {}) => ({ measurement: 1, n: 6, label: 'Сік 1 л', msg: '{N}', enabled: true, ...over });

  it('is optional: a rule without one stays without one', () => {
    expect('hint' in normalizePackRules([rule()])[0]).toBe(false);
  });

  it('is kept, trimmed, and may be empty (no caption on the card)', () => {
    expect(normalizePackRules([rule({ hint: '  По {N} шт.  ' })])[0].hint).toBe('По {N} шт.');
    expect(normalizePackRules([rule({ hint: '' })])[0].hint).toBe('');
  });

  it('is capped at 100 characters', () => {
    expect(() => normalizePackRules([rule({ hint: 'x'.repeat(101) })])).toThrow(BadRequestException);
  });

  it('the defaults carry the website texts', () => {
    expect(DEFAULT_PACK_RULES[1]).toMatchObject({ label: 'Сік 1 л', hint: 'По 6 шт. у комплекті — можна обрати різні смаки' });
    expect(DEFAULT_PACK_RULES[0].label).toBe('Сік 0,3 л');
  });
});
