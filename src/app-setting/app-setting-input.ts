import { BadRequestException } from '@nestjs/common';

// Every switch the panel knows, with the value it has while its row is
// missing. app-server falls back to the same defaults.
export const APP_SETTINGS = {
  // The "Новинки" carousel at the top of the app's catalog.
  new_carousel_enabled: false,
} as const;

export type AppSettings = { -readonly [K in keyof typeof APP_SETTINGS]: boolean };
export type AppSettingKey = keyof AppSettings;

/** The switches sent from the panel: known keys only, each a true/false. */
export function normalizeAppSettingsInput(body: Record<string, unknown>): Partial<AppSettings> {
  body = body ?? {};
  const out: Partial<AppSettings> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!(key in APP_SETTINGS)) throw new BadRequestException(`Невідоме налаштування «${key}»`);
    if (typeof value !== 'boolean') throw new BadRequestException(`${key}: має бути true або false`);
    out[key as AppSettingKey] = value;
  }
  if (Object.keys(out).length === 0) throw new BadRequestException('Немає що зберігати');
  return out;
}
