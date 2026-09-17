import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { WooOrder } from './woo-contact';

const PER_PAGE = 100;

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
   * Orders modified since `since`, oldest first. Paging follows the
   * X-WP-TotalPages header rather than guessing from the page size.
   */
  async fetchOrders(since?: string | null): Promise<WooOrder[]> {
    const { url, key, secret } = this.config;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    const orders: WooOrder[] = [];

    let page = 1;
    let totalPages = 1;

    do {
      const endpoint = new URL(`${url}/wp-json/wc/v3/orders`);
      endpoint.searchParams.set('per_page', String(PER_PAGE));
      endpoint.searchParams.set('page', String(page));
      endpoint.searchParams.set('orderby', 'modified');
      endpoint.searchParams.set('order', 'asc');
      if (since) {
        endpoint.searchParams.set('modified_after', since);
        // Our cursor comes from date_modified_gmt, so ask Woo to read it as GMT
        // instead of the shop's local timezone.
        endpoint.searchParams.set('dates_are_gmt', 'true');
      }

      const res = await fetch(endpoint.toString(), {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
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

    return orders;
  }
}
