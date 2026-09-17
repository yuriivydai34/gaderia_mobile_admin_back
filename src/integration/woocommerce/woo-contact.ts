/**
 * Turning WooCommerce orders into people.
 *
 * Measured against the live shop before this was written (scripts/woo-probe.mjs):
 * every order is a guest order, billing.phone is present on 100% of them and
 * billing.email on only ~69%, so the phone is the identity and the email is a
 * fallback. Joining people on "same phone OR same email" was tried and rejected:
 * one shared email chained 52 distinct customers into a single group.
 *
 * Duplicates are acceptable here - losing information is not - so anything that
 * cannot be collapsed with confidence is kept alongside rather than dropped.
 */

export type WooBilling = {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
};

export type WooMeta = { key?: string; value?: unknown };

export type WooOrder = {
  id: number;
  number?: string | null;
  status?: string | null;
  total?: string | null;
  currency?: string | null;
  customer_note?: string | null;
  payment_method_title?: string | null;
  date_created_gmt?: string | null;
  date_modified_gmt?: string | null;
  billing?: WooBilling | null;
  shipping?: WooBilling | null;
  meta_data?: WooMeta[] | null;
};

// Personal and delivery meta keys, as they actually appear in this shop.
// Marketing attribution (_wc_order_attribution_*) is deliberately left out.
const META_PATRONYMIC = [
  'mrkv_ua_shipping_ukr-poshta_patronymic',
  'mrkv_ua_shipping_nova-poshta_address_patronymic',
];

const META_DELIVERY = [
  'mrkv_ua_shipping_nova-poshta_city',
  'mrkv_ua_shipping_nova-poshta_city_ref',
  'mrkv_ua_shipping_nova-poshta_warehouse_ref',
  'mrkv_ua_shipping_nova-poshta_address_city',
  'mrkv_ua_shipping_nova-poshta_address_street_ref',
  'mrkv_ua_shipping_nova-poshta_address_flat',
  'mrkv_ua_shipping_ukr-poshta_city_ref',
  'mrkv_ua_shipping_ukr-poshta_address_ref',
  'mrkv_ua_ship_invoice_number',
];

const META_TTN = 'mrkv_ua_ship_invoice_number';

export type OrderSummary = {
  id: number;
  number: string | null;
  date: string | null;
  status: string | null;
  total: string | null;
  currency: string | null;
  payment: string | null;
  ttn: string | null;
};

/** A value together with when the shop first and last saw it. */
export type Seen = {
  value: string;
  firstSeen: string | null;
  lastSeen: string | null;
};

export type SourceData = {
  emails: Seen[];
  phones: Seen[];
  names: string[];
  patronymics: string[];
  companies: string[];
  addresses: string[];
  delivery: Record<string, string>[];
  notes: string[];
  orders: OrderSummary[];
  ordersCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  totalSpent: number;
};

export type WooContact = {
  external_id: string;
  full_name: string | null;
  email: string | null;
  number: string | null;
  name_company: string | null;
  region: string | null;
  settlement: string | null;
  address: string | null;
  source_data: SourceData;
  /** Promoted out of source_data so the database can sort and filter on them. */
  first_order_at: string | null;
  last_order_at: string | null;
  /** Newest order seen for this person, so later orders win on conflict. */
  seen_at: string;
};

function clean(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Digits only, so +38 (050) 111-22-33 and 0501112233 are the same person. */
export function normalisePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 9) return null;
  return `380${digits.slice(-9)}`;
}

export function identify(billing: WooBilling | null | undefined): string | null {
  const phone = normalisePhone(billing?.phone);
  if (phone) return `phone:${phone}`;
  const email = clean(billing?.email)?.toLowerCase();
  return email ? `email:${email}` : null;
}

function metaValue(order: WooOrder, key: string): string | null {
  const hit = (order.meta_data ?? []).find((m) => m.key === key);
  return clean(hit?.value);
}

function formatAddress(a: WooBilling | null | undefined): string | null {
  const joined = [clean(a?.address_1), clean(a?.address_2), clean(a?.postcode), clean(a?.city), clean(a?.state)]
    .filter(Boolean)
    .join(', ');
  return joined === '' ? null : joined;
}

/** Append only if new, preserving the order things were first seen in. */
function addUnique(list: string[], value: string | null): void {
  if (value && !list.includes(value)) list.push(value);
}

/**
 * Record a value against the date of the order it came from, so it is possible
 * to say when an address or a number first showed up and when it was last used.
 */
function addSeen(list: Seen[], value: string | null, at: string | null): void {
  if (!value) return;
  const existing = list.find((s) => s.value === value);
  if (!existing) {
    list.push({ value, firstSeen: at, lastSeen: at });
    return;
  }
  if (at) {
    if (!existing.firstSeen || at < existing.firstSeen) existing.firstSeen = at;
    if (!existing.lastSeen || at > existing.lastSeen) existing.lastSeen = at;
  }
}

function emptySourceData(): SourceData {
  return {
    emails: [], phones: [], names: [], patronymics: [], companies: [],
    addresses: [], delivery: [], notes: [], orders: [],
    ordersCount: 0, firstOrderAt: null, lastOrderAt: null, totalSpent: 0,
  };
}

/**
 * Accumulates orders into one record per person. Fed page by page, so the whole
 * order history never has to be held at once: at ~6 KB per order and ~17k
 * orders, buffering them would cost about 100 MB.
 */
export class ContactCollector {
  private readonly people = new Map<string, WooContact>();

  get size(): number {
    return this.people.size;
  }

  add(order: WooOrder): void {
    const billing = order.billing;
    const external_id = identify(billing);
    if (!external_id) return;

    const at = order.date_modified_gmt ?? order.date_created_gmt ?? '';
    const existing = this.people.get(external_id);
    const data = existing?.source_data ?? emptySourceData();

    const name = [clean(billing?.first_name), clean(billing?.last_name)].filter(Boolean).join(' ') || null;
    const email = clean(billing?.email)?.toLowerCase() ?? null;
    const phone = clean(billing?.phone);
    const company = clean(billing?.company);
    // Measured on the real shop: billing.address_1 is filled on only ~37% of
    // customers, while the delivery address - usually a Nova Poshta branch -
    // is in the shipping block for ~99% of them. Prefer billing, fall back to
    // shipping rather than showing an empty address.
    const shipping = order.shipping;
    const address = formatAddress(billing) ?? formatAddress(shipping);
    const region = clean(billing?.state) ?? clean(shipping?.state);
    const settlement = clean(billing?.city) ?? clean(shipping?.city);

    // Dated against when the order was placed, not when it was last edited.
    const placedAt = order.date_created_gmt ?? null;
    addSeen(data.emails, email, placedAt);
    addSeen(data.phones, phone, placedAt);
    addUnique(data.names, name);
    addUnique(data.companies, company);
    addUnique(data.addresses, address);
    addUnique(data.addresses, formatAddress(shipping));
    addUnique(data.notes, clean(order.customer_note));
    for (const key of META_PATRONYMIC) addUnique(data.patronymics, metaValue(order, key));

    const delivery: Record<string, string> = {};
    for (const key of META_DELIVERY) {
      const value = metaValue(order, key);
      if (value) delivery[key.replace('mrkv_ua_shipping_', '').replace('mrkv_ua_', '')] = value;
    }
    if (Object.keys(delivery).length > 0) {
      const serialised = JSON.stringify(delivery);
      if (!data.delivery.some((d) => JSON.stringify(d) === serialised)) {
        data.delivery.push(delivery);
      }
    }

    if (!data.orders.some((o) => o.id === order.id)) {
      data.orders.push({
        id: order.id,
        number: clean(order.number),
        date: order.date_created_gmt ?? null,
        status: clean(order.status),
        total: clean(order.total),
        currency: clean(order.currency),
        payment: clean(order.payment_method_title),
        ttn: metaValue(order, META_TTN),
      });
      data.ordersCount = data.orders.length;
      data.totalSpent = Number(
        data.orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0).toFixed(2),
      );
      const dates = data.orders.map((o) => o.date).filter(Boolean).sort() as string[];
      data.firstOrderAt = dates[0] ?? null;
      data.lastOrderAt = dates[dates.length - 1] ?? null;
    }

    // The flat columns follow the newest order; everything earlier stays in
    // source_data rather than being overwritten.
    const newer = !existing || at >= existing.seen_at;
    this.people.set(external_id, {
      external_id,
      full_name:    newer ? name ?? existing?.full_name ?? null : existing?.full_name ?? name,
      email:        newer ? email ?? existing?.email ?? null : existing?.email ?? email,
      number:       newer ? phone ?? existing?.number ?? null : existing?.number ?? phone,
      name_company: newer ? company ?? existing?.name_company ?? null : existing?.name_company ?? company,
      region:       newer ? region ?? existing?.region ?? null : existing?.region ?? region,
      settlement:   newer ? settlement ?? existing?.settlement ?? null : existing?.settlement ?? settlement,
      address:      newer ? address ?? existing?.address ?? null : existing?.address ?? address,
      source_data:  data,
      first_order_at: data.firstOrderAt,
      last_order_at:  data.lastOrderAt,
      seen_at:      newer ? at : existing.seen_at,
    });
  }

  addAll(orders: WooOrder[]): void {
    for (const order of orders) this.add(order);
  }

  values(): WooContact[] {
    return [...this.people.values()];
  }
}

/**
 * Combine what is already stored for a person with what a later run found.
 *
 * Without this an incremental sync would overwrite source_data with just the
 * orders in its window, throwing away everything older. Every step is a union
 * or a min/max, so merging the same data twice changes nothing.
 */
export function mergeSourceData(stored: Partial<SourceData> | null | undefined, incoming: SourceData): SourceData {
  const merged = emptySourceData();

  for (const [into, lists] of [
    [merged.emails, [stored?.emails ?? [], incoming.emails]],
    [merged.phones, [stored?.phones ?? [], incoming.phones]],
  ] as [Seen[], Seen[][]][]) {
    for (const list of lists) {
      for (const seen of list) {
        // Feeding both ends through addSeen keeps the min/max, whichever side
        // happened to hold the earlier or later date.
        addSeen(into, seen.value, seen.firstSeen);
        addSeen(into, seen.value, seen.lastSeen);
      }
    }
  }
  for (const key of ['names', 'patronymics', 'companies', 'addresses', 'notes'] as const) {
    for (const value of [...(stored?.[key] ?? []), ...incoming[key]]) addUnique(merged[key], value);
  }
  for (const record of [...(stored?.delivery ?? []), ...incoming.delivery]) {
    const serialised = JSON.stringify(record);
    if (!merged.delivery.some((d) => JSON.stringify(d) === serialised)) merged.delivery.push(record);
  }
  for (const order of [...(stored?.orders ?? []), ...incoming.orders]) {
    if (!merged.orders.some((o) => o.id === order.id)) merged.orders.push(order);
  }

  merged.orders.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  merged.ordersCount = merged.orders.length;
  merged.totalSpent = Number(
    merged.orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0).toFixed(2),
  );
  const dates = merged.orders.map((o) => o.date).filter(Boolean) as string[];
  merged.firstOrderAt = dates[0] ?? null;
  merged.lastOrderAt = dates[dates.length - 1] ?? null;
  return merged;
}

/** Convenience wrapper for tests and small batches. */
export function collapse(orders: WooOrder[]): WooContact[] {
  const collector = new ContactCollector();
  collector.addAll(orders);
  return collector.values();
}
