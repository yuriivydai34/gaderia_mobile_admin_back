import { BadRequestException } from '@nestjs/common';

// Every setting the panel knows, its kind and the value it has while its row
// is missing. app-server falls back to the same defaults (GET /app/config).
export const APP_SETTINGS = {
  // The "Новинки" carousel at the top of the app's catalog.
  new_carousel_enabled: { kind: 'boolean', default: false },
  // An app older than this shows only "Оновіть застосунок" and a store link.
  min_app_version: { kind: 'version', default: null },
  // An app older than this asks once to update and can be dismissed.
  latest_app_version: { kind: 'version', default: null },
} as const;

export type AppSettings = {
  new_carousel_enabled: boolean;
  min_app_version: string | null;
  latest_app_version: string | null;
};
export type AppSettingKey = keyof AppSettings;

// As in pubspec.yaml without the build number: 1.3.2.
export const VERSION_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const LABEL: Record<AppSettingKey, string> = {
  new_carousel_enabled: 'Карусель «Новинки»',
  min_app_version: 'Мінімальна версія',
  latest_app_version: 'Рекомендована версія',
};

export function defaultAppSettings(): AppSettings {
  const out = {} as Record<string, unknown>;
  for (const [key, spec] of Object.entries(APP_SETTINGS)) out[key] = spec.default;
  return out as AppSettings;
}

/** A stored value, or undefined if it is not what the key holds. */
export function readStoredValue(key: string, value: unknown): unknown {
  const spec = APP_SETTINGS[key as AppSettingKey];
  if (!spec) return undefined;
  if (spec.kind === 'boolean') return typeof value === 'boolean' ? value : undefined;
  return typeof value === 'string' && VERSION_PATTERN.test(value) ? value : undefined;
}

/** -1, 0 or 1, comparing 1.3.10 after 1.3.9 rather than as text. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * The settings sent from the panel: known keys only, each of its kind. A
 * version may be cleared with an empty string or null. `current` is what is
 * stored, for the check that the minimum is not above the recommended one.
 */
export function normalizeAppSettingsInput(
  body: Record<string, unknown>,
  current: AppSettings = defaultAppSettings(),
): Partial<AppSettings> {
  body = body ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const spec = APP_SETTINGS[key as AppSettingKey];
    if (!spec) throw new BadRequestException(`Невідоме налаштування «${key}»`);
    const label = LABEL[key as AppSettingKey];
    if (spec.kind === 'boolean') {
      if (typeof value !== 'boolean') throw new BadRequestException(`${label}: має бути true або false`);
      out[key] = value;
    } else {
      const text = value === null || value === undefined ? '' : String(value).trim();
      if (text && !VERSION_PATTERN.test(text)) {
        throw new BadRequestException(`${label}: вкажіть у вигляді 1.3.2`);
      }
      out[key] = text || null;
    }
  }
  if (Object.keys(out).length === 0) throw new BadRequestException('Немає що зберігати');

  const next = { ...current, ...out } as AppSettings;
  if (next.min_app_version && next.latest_app_version && compareVersions(next.min_app_version, next.latest_app_version) > 0) {
    throw new BadRequestException('Мінімальна версія не може бути новішою за рекомендовану');
  }
  return out as Partial<AppSettings>;
}
