import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PushInput } from './push-input';

export type PushResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Sends push notifications by calling app-server's own endpoint
 * (POST /account/push/broadcast) rather than talking to Firebase directly:
 * that endpoint already has the Firebase Admin SDK wired up, already knows
 * the "all" topic every install subscribes to, and already handles a dead
 * fcm_token by clearing it off the account. Duplicating that here would be
 * two services guessing at the same Firebase project.
 *
 * Authenticated with APP_SERVER_PUSH_TOKEN: an app-server account token
 * with role ADMIN (app-server's own auth, unrelated to this API's JWT -
 * the two services do not share a login). It does not expire on its own.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  private get config(): { url: string; token: string } {
    const url = process.env.APP_SERVER_URL;
    const token = process.env.APP_SERVER_PUSH_TOKEN;
    if (!url || !token) {
      throw new ServiceUnavailableException(
        'Push не налаштовано: на сервері немає APP_SERVER_URL і APP_SERVER_PUSH_TOKEN',
      );
    }
    return { url: url.replace(/\/+$/, ''), token };
  }

  async send(input: PushInput): Promise<PushResult> {
    const { url, token } = this.config;

    let res: Response;
    try {
      res = await fetch(`${url}/account/push/broadcast`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          ...(input.image ? { image: input.image } : {}),
          ...(input.account_id ? { account_id: input.account_id } : {}),
        }),
      });
    } catch (error) {
      this.logger.error(`push: app-server unreachable: ${String(error)}`);
      return { ok: false, status: 502, message: 'app-server недоступний' };
    }

    if (res.ok) return { ok: true };

    // app-server's own reply shape (response_structure.js): {error} is an
    // object of field -> message, the same way this API's own validation
    // errors read.
    const body = (await res.json().catch(() => ({}))) as {
      error?: Record<string, unknown> | string;
      message?: string;
    };
    const message =
      body.error && typeof body.error === 'object'
        ? Object.values(body.error).map(String).join('; ')
        : (body.error ?? body.message ?? `app-server відповів ${res.status}`);
    this.logger.warn(`push: app-server ${res.status}: ${message}`);
    return { ok: false, status: res.status, message };
  }
}
