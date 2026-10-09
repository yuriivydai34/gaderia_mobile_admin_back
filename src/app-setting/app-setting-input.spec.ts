import { BadRequestException } from '@nestjs/common';
import { compareVersions, defaultAppSettings, normalizeAppSettingsInput, readStoredValue } from './app-setting-input';

describe('normalizeAppSettingsInput', () => {
  it('takes a known switch as true or false', () => {
    expect(normalizeAppSettingsInput({ new_carousel_enabled: true })).toEqual({ new_carousel_enabled: true });
    expect(normalizeAppSettingsInput({ new_carousel_enabled: false })).toEqual({ new_carousel_enabled: false });
  });

  it('refuses an unknown key, so a typo cannot add a row nobody reads', () => {
    expect(() => normalizeAppSettingsInput({ new_carousel: true })).toThrow(BadRequestException);
  });

  it('refuses anything but a boolean for a switch ("false" as a string would read as on)', () => {
    expect(() => normalizeAppSettingsInput({ new_carousel_enabled: 'false' })).toThrow(BadRequestException);
    expect(() => normalizeAppSettingsInput({ new_carousel_enabled: 1 })).toThrow(BadRequestException);
  });

  it('refuses an empty body', () => {
    expect(() => normalizeAppSettingsInput({})).toThrow(BadRequestException);
    expect(() => normalizeAppSettingsInput(undefined as unknown as Record<string, unknown>)).toThrow(BadRequestException);
  });

  it('takes a version as 1.3.2 and clears it with an empty value', () => {
    expect(normalizeAppSettingsInput({ min_app_version: ' 1.3.2 ' })).toEqual({ min_app_version: '1.3.2' });
    expect(normalizeAppSettingsInput({ latest_app_version: '' })).toEqual({ latest_app_version: null });
    expect(normalizeAppSettingsInput({ latest_app_version: null })).toEqual({ latest_app_version: null });
  });

  it('refuses a version in any other shape (with the build number, two parts, text)', () => {
    for (const v of ['1.3.2+1', '1.3', 'v1.3.2', 'остання']) {
      expect(() => normalizeAppSettingsInput({ min_app_version: v })).toThrow(BadRequestException);
    }
  });

  it('refuses a minimum above the recommended one, also against what is stored', () => {
    expect(() => normalizeAppSettingsInput({ min_app_version: '1.4.0', latest_app_version: '1.3.2' })).toThrow(BadRequestException);
    const stored = { ...defaultAppSettings(), latest_app_version: '1.3.2' };
    expect(() => normalizeAppSettingsInput({ min_app_version: '1.3.10' }, stored)).toThrow(BadRequestException);
    expect(normalizeAppSettingsInput({ min_app_version: '1.3.2' }, stored)).toEqual({ min_app_version: '1.3.2' });
  });
});

describe('compareVersions', () => {
  it('compares by number, not as text', () => {
    expect(compareVersions('1.3.10', '1.3.9')).toBe(1);
    expect(compareVersions('1.3.2', '1.3.2')).toBe(0);
    expect(compareVersions('1.2.9', '1.3.0')).toBe(-1);
  });
});

describe('readStoredValue', () => {
  it('ignores a stored value of the wrong kind', () => {
    expect(readStoredValue('new_carousel_enabled', 'true')).toBeUndefined();
    expect(readStoredValue('min_app_version', 'abc')).toBeUndefined();
    expect(readStoredValue('min_app_version', '1.3.2')).toBe('1.3.2');
    expect(readStoredValue('unknown', true)).toBeUndefined();
  });
});

describe('bot settings', () => {
  it('keeps the sale text with its line breaks, trimmed; empty clears it', () => {
    expect(normalizeAppSettingsInput({ bot_sale_text: '  🔥 <b>-10%</b>\r\nна соки  ' })).toEqual({
      bot_sale_text: '🔥 <b>-10%</b>\nна соки',
    });
    expect(normalizeAppSettingsInput({ bot_sale_text: '   ' })).toEqual({ bot_sale_text: null });
  });

  it('refuses a sale text longer than a Telegram message can carry', () => {
    expect(() => normalizeAppSettingsInput({ bot_sale_text: 'x'.repeat(3501) })).toThrow(/3500/);
  });

  it('takes the manager as @name, name or a t.me link, and stores just the name', () => {
    for (const given of ['@Olya_Gaderia', 'Olya_Gaderia', 'https://t.me/Olya_Gaderia']) {
      expect(normalizeAppSettingsInput({ bot_manager_username: given })).toEqual({ bot_manager_username: 'Olya_Gaderia' });
    }
  });

  it.each(['Оля', 'ab', 'olya gaderia', '1olya', 'x'.repeat(33)])('refuses %p as a Telegram name', (given) => {
    expect(() => normalizeAppSettingsInput({ bot_manager_username: given })).toThrow(BadRequestException);
  });

  it('notifications are on until switched off', () => {
    expect(defaultAppSettings().bot_notify_enabled).toBe(true);
    expect(normalizeAppSettingsInput({ bot_notify_enabled: false })).toEqual({ bot_notify_enabled: false });
  });

  it('reads back only values of the right kind', () => {
    expect(readStoredValue('bot_manager_username', 'Olya_Gaderia')).toBe('Olya_Gaderia');
    expect(readStoredValue('bot_manager_username', '@bad name')).toBeUndefined();
    expect(readStoredValue('bot_manager_work_hours', 'Пн–Пт 9–18')).toBe('Пн–Пт 9–18');
    expect(readStoredValue('bot_sale_text', 42)).toBeUndefined();
  });
});
