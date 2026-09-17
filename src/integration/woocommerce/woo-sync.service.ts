import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../customer/customer.entity';
import { IntegrationState } from './integration-state.entity';
import { WooClient } from './woo.client';
import { ContactCollector, SourceData, WooContact, mergeSourceData } from './woo-contact';

export const WOO_SOURCE = 'woocommerce';
const CURSOR_KEY = 'woocommerce.orders.modified_after';

export type SyncResult = {
  ordersScanned: number;
  contactsFound: number;
  created: number;
  updated: number;
  linkedToExisting: number;
  cursor: string | null;
  /** Which date field the shop let us filter on. */
  strategy: 'modified' | 'created';
};

function rewindOneSecond(iso: string): string {
  const at = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  at.setUTCSeconds(at.getUTCSeconds() - 1);
  return at.toISOString().replace(/\.\d{3}Z$/, '');
}

@Injectable()
export class WooSyncService {
  private readonly logger = new Logger(WooSyncService.name);
  private running = false;

  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(IntegrationState)
    private readonly state: Repository<IntegrationState>,
    private readonly woo: WooClient,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  async getCursor(): Promise<string | null> {
    const row = await this.state.findOne({ where: { key: CURSOR_KEY } });
    return row?.value ?? null;
  }

  async sync(options: { full?: boolean } = {}): Promise<SyncResult> {
    if (this.running) {
      throw new Error('A WooCommerce sync is already running');
    }
    this.running = true;
    try {
      const since = options.full ? null : await this.getCursor();
      this.logger.log(since ? `syncing orders modified after ${since}` : 'syncing all orders');

      // Streamed page by page: the shop holds ~17k orders at ~6 KB each, so
      // buffering the lot would cost about 100 MB of heap.
      const collector = new ContactCollector();
      let ordersScanned = 0;
      let newest = '';
      let strategy: 'modified' | 'created' = 'modified';

      for await (const batch of this.woo.streamOrders(since)) {
        strategy = batch.strategy;
        collector.addAll(batch.orders);
        ordersScanned += batch.orders.length;
        for (const order of batch.orders) {
          // Must match whatever the shop actually filtered on, or the next run
          // asks for a window that does not line up.
          const at = (strategy === 'modified'
            ? order.date_modified_gmt ?? order.date_created_gmt
            : order.date_created_gmt ?? order.date_modified_gmt) ?? '';
          if (at > newest) newest = at;
        }
      }

      const contacts = collector.values();
      let created = 0;
      let updated = 0;
      let linkedToExisting = 0;

      for (const contact of contacts) {
        const outcome = await this.upsert(contact);
        if (outcome === 'created') created++;
        else if (outcome === 'updated') updated++;
        else linkedToExisting++;
      }

      // Advance only on success, and only as far as the newest order actually
      // seen - a run that fails halfway is simply repeated next time.
      const cursor = newest ? rewindOneSecond(newest) : since;
      if (cursor) {
        await this.state.save({ key: CURSOR_KEY, value: cursor });
      }

      const result: SyncResult = {
        ordersScanned,
        contactsFound: contacts.length,
        created,
        updated,
        linkedToExisting,
        cursor: cursor ?? null,
        strategy,
      };
      this.logger.log(`sync finished: ${JSON.stringify(result)}`);
      return result;
    } finally {
      this.running = false;
    }
  }

  /**
   * Imported buyers live in their own table, so there is no account to collide
   * with: either we have seen this person before, or we have not.
   */
  private async upsert(contact: WooContact): Promise<'created' | 'updated' | 'linked'> {
    const existing = await this.customers.findOne({
      where: { source: WOO_SOURCE, external_id: contact.external_id },
    });

    // An incremental run only sees recent orders, so the stored history has to
    // be merged in rather than overwritten.
    const source_data = existing
      ? mergeSourceData(existing.source_data as Partial<SourceData> | null, contact.source_data)
      : contact.source_data;

    const fields = {
      full_name: contact.full_name,
      email: contact.email,
      number: contact.number,
      name_company: contact.name_company,
      region: contact.region,
      settlement: contact.settlement,
      address: contact.address,
      source_data,
      first_order_at: source_data.firstOrderAt ? new Date(`${source_data.firstOrderAt}Z`) : null,
      last_order_at: source_data.lastOrderAt ? new Date(`${source_data.lastOrderAt}Z`) : null,
    };

    if (existing) {
      await this.customers.update(existing.id, fields);
      return 'updated';
    }

    await this.customers.save(
      this.customers.create({ ...fields, source: WOO_SOURCE, external_id: contact.external_id }),
    );
    return 'created';
  }

  async importedCount(): Promise<number> {
    return this.customers.count({ where: { source: WOO_SOURCE } });
  }
}
