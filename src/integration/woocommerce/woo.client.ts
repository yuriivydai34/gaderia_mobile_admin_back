import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { WooOrder } from './woo-contact';

const PER_PAGE = 100;

export type Strategy = 'modified' | 'created';
export type FetchResult = { orders: WooOrder[]; strategy: Strategy };

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
    return { url: url.replace(/\/+$/, ''), key, secret };
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
  async fetchOrders(since?: string | null): Promise<FetchResult> {
    try {
      return await this.page('modified', since);
    } catch (error) {
      if (!(error instanceof UnsupportedParameter)) throw error;
      this.logger.warn(
        `shop rejected modified-date filtering (${error.detail}); falling back to creation date. ` +
        'Orders edited after import will not be picked up again.',
      );
      return this.page('created', since);
    }
  }

  private async page(strategy: Strategy, since?: string | null): Promise<FetchResult> {
    const { url, key, secret } = this.config;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    const orders: WooOrder[] = [];

    let page = 1;
    let totalPages = 1;

    do {
      const endpoint = new URL(`${url}/wp-json/wc/v3/orders`);
      endpoint.searchParams.set('per_page', String(PER_PAGE));
      endpoint.searchParams.set('page', String(page));
      endpoint.searchParams.set('order', 'asc');

      if (strategy === 'modified') {
        endpoint.searchParams.set('orderby', 'modified');
        if (since) {
          endpoint.searchParams.set('modified_after', since);
          // Our cursor comes from date_modified_gmt, so ask Woo to read it as
          // GMT instead of the shop's local timezone.
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
        // WordPress answers 400 with rest_invalid_param when it does not know
        // a query parameter, which is worth retrying differently rather than
        // reporting as an outage.
        if (res.status === 400 && strategy === 'modified' && page === 1) {
          throw new UnsupportedParameter(body.slice(0, 200));
        }
        throw new ServiceUnavailableException(
          `WooCommerce responded ${res.status}: ${body.slice(0, 200)}`,
        );
      }

      const batch = (await res.json()) as WooOrder[];
      orders.push(...batch);

      totalPages = Number(res.headers.get('x-wp-totalpages') ?? '1') || 1;
      this.logger.log(`orders page ${page}/${totalPages}: ${batch.length} rows`);
      page++;
    } while (page <= totalPages);

    return { orders, strategy };
  }
}
