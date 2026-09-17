import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { WooOrder } from './woo-contact';

/**
 * WOO_URL may be given as the site root or as a ready API path, so accept both
 * rather than silently building https://shop/wp-json/wc/v3/wp-json/wc/v3/...
 */
export function apiBase(raw: string): string {
  const trimmed = raw.replace(/\/+$/, '');
  return /\/wp-json\/wc\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/wp-json/wc/v3`;
}

const PER_PAGE = 100;

export type Strategy = 'modified' | 'created';
export type Batch = { orders: WooOrder[]; strategy: Strategy; page: number; totalPages: number };

class UnsupportedParameter extends Error {
  constructor(readonly detail: string) {
    super(detail);
  }
}

@Injectable()
export class WooClient {
  private readonly logger = new Logger(WooClient.name);

  private get config() {
    const url = process.env.WOO_URL;
    const key = process.env.WOO_CONSUMER_KEY;
    const secret = process.env.WOO_CONSUMER_SECRET;
    if (!url || !key || !secret) {
      throw new ServiceUnavailableException(
        'WooCommerce is not configured: set WOO_URL, WOO_CONSUMER_KEY and WOO_CONSUMER_SECRET',
      );
    }
    return { url: apiBase(url), key, secret };
  }

  get isConfigured(): boolean {
    return Boolean(process.env.WOO_URL && process.env.WOO_CONSUMER_KEY && process.env.WOO_CONSUMER_SECRET);
  }

  /**
   * Orders changed since `since`, oldest first.
   *
   * `orderby=modified` and `modified_after` are not in the documented parameter
   * list for orders, so a shop may reject them. When that happens we fall back
   * to the documented `after`, which filters on creation date instead - the
   * caller is told which one was used, because it changes which timestamp the
   * cursor must be taken from.
   */
  async *streamOrders(since?: string | null): AsyncGenerator<Batch> {
    try {
      // Probe the first page before committing to a strategy, so a rejected
      // parameter is discovered before anything has been yielded.
      const first = await this.page('modified', since, 1);
      yield first;
      yield* this.rest('modified', since, first.totalPages);
      return;
    } catch (error) {
      if (!(error instanceof UnsupportedParameter)) throw error;
      this.logger.warn(
        `shop rejected modified-date filtering (${error.detail}); falling back to creation date. ` +
        'Orders edited after import will not be picked up again.',
      );
    }
    const first = await this.page('created', since, 1);
    yield first;
    yield* this.rest('created', since, first.totalPages);
  }

  private async *rest(strategy: Strategy, since: string | null | undefined, totalPages: number): AsyncGenerator<Batch> {
    for (let page = 2; page <= totalPages; page++) {
      yield await this.page(strategy, since, page);
    }
  }

  private async page(strategy: Strategy, since: string | null | undefined, page: number): Promise<Batch> {
    const { url, key, secret } = this.config;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');

    const endpoint = new URL(`${url}/orders`);
    endpoint.searchParams.set('per_page', String(PER_PAGE));
    endpoint.searchParams.set('page', String(page));
    endpoint.searchParams.set('order', 'asc');

    if (strategy === 'modified') {
      endpoint.searchParams.set('orderby', 'modified');
      if (since) {
        endpoint.searchParams.set('modified_after', since);
        // Our cursor comes from date_modified_gmt, so ask Woo to read it as GMT
        // rather than in the shop's local timezone.
        endpoint.searchParams.set('dates_are_gmt', 'true');
      }
    } else {
      endpoint.searchParams.set('orderby', 'date');
      if (since) {
        endpoint.searchParams.set('after', since);
        endpoint.searchParams.set('dates_are_gmt', 'true');
      }
    }

    const res = await fetch(endpoint.toString(), {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // WordPress answers 400 with rest_invalid_param for a parameter it does
      // not know, which is worth retrying differently rather than reporting as
      // an outage.
      if (res.status === 400 && strategy === 'modified' && page === 1) {
        throw new UnsupportedParameter(body.slice(0, 200));
      }
      throw new ServiceUnavailableException(
        `WooCommerce responded ${res.status}: ${body.slice(0, 200)}`,
      );
    }

    const orders = (await res.json()) as WooOrder[];
    const totalPages = Number(res.headers.get('x-wp-totalpages') ?? '1') || 1;
    this.logger.log(`orders page ${page}/${totalPages}: ${orders.length} rows`);

    return { orders, strategy, page, totalPages };
  }
}
