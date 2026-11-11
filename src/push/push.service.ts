import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushInput } from './push-input';
import { PushLog } from './push-log.entity';

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

  constructor(
    @InjectRepository(PushLog)
    private readonly pushLogRepository: Repository<PushLog>,
  ) {}

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

  /** `sentBy` is logged only - the e-mail of whoever is signed in here. */
  async send(input: PushInput, sentBy: string | null): Promise<PushResult> {
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

    // app-server's own reply shape (response_structure.js): {error} is an
    // object of field -> message on failure, {data} on success.
    const body = (await res.json().catch(() => ({}))) as {
      error?: Record<string, unknown> | string;
      message?: string;
      data?: { message_id?: string };
    };

    if (res.ok) {
      // Kept for the "Останні надіслані" list on the panel's own page -
      // app-server never reads this table, see migrations/025_push_log.sql.
      await this.pushLogRepository.save(
        this.pushLogRepository.create({
          title: input.title,
          body: input.body,
          image: input.image,
          account_id: input.account_id,
          message_id: body.data?.message_id ?? null,
          sent_by: sentBy,
        }),
      );
      return { ok: true };
    }

    const message =
      body.error && typeof body.error === 'object'
        ? Object.values(body.error).map(String).join('; ')
        : (body.error ?? body.message ?? `app-server відповів ${res.status}`);
    this.logger.warn(`push: app-server ${res.status}: ${message}`);
    return { ok: false, status: res.status, message };
  }

  /** Newest first, for the panel's own history list - not app-server's. */
  async recent(limit = 20): Promise<PushLog[]> {
    return this.pushLogRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
