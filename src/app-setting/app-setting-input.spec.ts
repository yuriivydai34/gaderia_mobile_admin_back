import { BadRequestException } from '@nestjs/common';
import { normalizeAppSettingsInput } from './app-setting-input';

describe('normalizeAppSettingsInput', () => {
  it('takes a known switch as true or false', () => {
    expect(normalizeAppSettingsInput({ new_carousel_enabled: true })).toEqual({ new_carousel_enabled: true });
    expect(normalizeAppSettingsInput({ new_carousel_enabled: false })).toEqual({ new_carousel_enabled: false });
  });

  it('refuses an unknown key, so a typo cannot add a row nobody reads', () => {
    expect(() => normalizeAppSettingsInput({ new_carousel: true })).toThrow(BadRequestException);
  });

  it('refuses anything but a boolean ("false" as a string would read as on)', () => {
    expect(() => normalizeAppSettingsInput({ new_carousel_enabled: 'false' })).toThrow(BadRequestException);
    expect(() => normalizeAppSettingsInput({ new_carousel_enabled: 1 })).toThrow(BadRequestException);
  });

  it('refuses an empty body', () => {
    expect(() => normalizeAppSettingsInput({})).toThrow(BadRequestException);
    expect(() => normalizeAppSettingsInput(undefined as unknown as Record<string, unknown>)).toThrow(BadRequestException);
  });
});
