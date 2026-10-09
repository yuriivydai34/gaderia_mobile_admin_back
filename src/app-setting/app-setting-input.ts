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

  // The Telegram bot (gaderia_bot, services/settings.py). Empty means the
  // bot's own value: the text in texts.py, the manager and hours in its .env.
  // The bot's "🔥 Акції" message. Telegram HTML (<b>, <i>, <a href>).
  bot_sale_text: { kind: 'text', max: 3500, default: null },
  // Who "👩‍💼 Менеджер" opens a chat with, without @.
  bot_manager_username: { kind: 'telegram_username', default: null },
  // Shown under the manager button: "Пн–Пт 9:00–18:00".
  bot_manager_work_hours: { kind: 'text', max: 200, default: null },
  // Order status messages to subscribed clients. Off pauses them; changes
  // made while paused are skipped, not sent in a burst when switched back on.
  bot_notify_enabled: { kind: 'boolean', default: true },
} as const;

export type AppSettings = {
  new_carousel_enabled: boolean;
  min_app_version: string | null;
  latest_app_version: string | null;
  bot_sale_text: string | null;
  bot_manager_username: string | null;
  bot_manager_work_hours: string | null;
  bot_notify_enabled: boolean;
};
export type AppSettingKey = keyof AppSettings;

// As in pubspec.yaml without the build number: 1.3.2.
export const VERSION_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// Telegram's own rule for a username: 5-32 characters, Latin letters, digits
// and _, starting with a letter.
export const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

const LABEL: Record<AppSettingKey, string> = {
  new_carousel_enabled: 'Карусель «Новинки»',
  min_app_version: 'Мінімальна версія',
  latest_app_version: 'Рекомендована версія',
  bot_sale_text: 'Текст «Акції»',
  bot_manager_username: 'Менеджер у Telegram',
  bot_manager_work_hours: 'Графік менеджера',
  bot_notify_enabled: 'Сповіщення клієнтам',
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
  if (typeof value !== 'string') return undefined;
  if (spec.kind === 'version') return VERSION_PATTERN.test(value) ? value : undefined;
  if (spec.kind === 'telegram_username') return TELEGRAM_USERNAME_PATTERN.test(value) ? value : undefined;
  return value.length <= spec.max ? value : undefined;
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
    } else if (spec.kind === 'version') {
      const text = value === null || value === undefined ? '' : String(value).trim();
      if (text && !VERSION_PATTERN.test(text)) {
        throw new BadRequestException(`${label}: вкажіть у вигляді 1.3.2`);
      }
      out[key] = text || null;
    } else if (spec.kind === 'telegram_username') {
      const text = value === null || value === undefined ? '' : String(value).trim().replace(/^@|^https?:\/\/t\.me\//, '');
      if (text && !TELEGRAM_USERNAME_PATTERN.test(text)) {
        throw new BadRequestException(`${label}: ім'я в Telegram, 5–32 латинські літери, цифри або _`);
      }
      out[key] = text || null;
    } else {
      // Line breaks are kept: the bot sends the text as written.
      const text = value === null || value === undefined ? '' : String(value).replace(/\r\n/g, '\n').trim();
      if (text.length > spec.max) {
        throw new BadRequestException(`${label}: не довше ${spec.max} символів (зараз ${text.length})`);
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
