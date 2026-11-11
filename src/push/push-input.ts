import { BadRequestException } from '@nestjs/common';

export type PushInput = {
  title: string;
  body: string;
  image: string | null;
  account_id: number | null;
};

function fail(message: string): never {
  throw new BadRequestException(message);
}

function blank(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'object') return false;
  return String(v).trim() === '';
}

function text(v: unknown, field: string, max: number): string {
  if (blank(v)) fail(`${field}: обов'язкове поле`);
  const trimmed = String(v).trim();
  if (trimmed.length > max) fail(`${field}: не довше ${max} символів`);
  return trimmed;
}

/**
 * Checks what the "Push-сповіщення" page sends before it reaches
 * app-server: the same rules that endpoint enforces (title/body required,
 * image must be http(s)), checked here too so a mistake is a 400 from our
 * own API, not a request that reaches app-server only to be rejected there.
 */
export function normalizePushInput(body: Record<string, unknown>): PushInput {
  body = body ?? {};
  const title = text(body.title, 'Заголовок', 100);
  const message = text(body.body, 'Текст', 500);

  let image: string | null = null;
  if (!blank(body.image)) {
    const trimmed = String(body.image).trim();
    if (!/^https?:\/\//.test(trimmed))
      fail('Картинка: посилання має починатись з http(s)://');
    image = trimmed;
  }

  let account_id: number | null = null;
  if (!blank(body.account_id)) {
    const n = Number(body.account_id);
    if (!Number.isInteger(n) || n <= 0) fail('account_id: має бути id акаунта');
    account_id = n;
  }

  return { title, body: message, image, account_id };
}
