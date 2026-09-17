/**
 * Mapping from a WooCommerce order's billing block to our Account fields.
 *
 * The shop has always sold to guests, so orders carry `customer_id: 0` and
 * there is no WooCommerce customer to key on. A person is therefore identified
 * by their billing email, falling back to their phone number.
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

export type WooOrder = {
  id: number;
  date_modified_gmt?: string | null;
  date_created_gmt?: string | null;
  billing?: WooBilling | null;
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
  /** Newest order this contact was seen on, so later orders win on conflict. */
  seen_at: string;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Digits only, so +38 (050) 111-22-33 and 0501112233 are the same person. */
export function normalisePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 9) return null;
  // Ukrainian numbers reach us as 0XXXXXXXXX, 380XXXXXXXXX or 80XXXXXXXXX.
  const tail = digits.slice(-9);
  return `380${tail}`;
}

export function identify(billing: WooBilling | null | undefined): string | null {
  const email = clean(billing?.email)?.toLowerCase();
  if (email) return `email:${email}`;
  const phone = normalisePhone(billing?.phone);
  return phone ? `phone:${phone}` : null;
}

export function toContact(order: WooOrder): WooContact | null {
  const billing = order.billing;
  const external_id = identify(billing);
  if (!external_id) return null;

  const name = [clean(billing?.first_name), clean(billing?.last_name)]
    .filter(Boolean)
    .join(' ');

  const address = [clean(billing?.address_1), clean(billing?.address_2), clean(billing?.postcode)]
    .filter(Boolean)
    .join(', ');

  return {
    external_id,
    full_name: name === '' ? null : name,
    email: clean(billing?.email)?.toLowerCase() ?? null,
    number: clean(billing?.phone),
    name_company: clean(billing?.company),
    region: clean(billing?.state),
    settlement: clean(billing?.city),
    address: address === '' ? null : address,
    seen_at: order.date_modified_gmt ?? order.date_created_gmt ?? '',
  };
}

/**
 * One person can appear on many orders, with details that changed over time.
 * Collapse them, keeping the newest non-empty value for each field.
 */
export function collapse(orders: WooOrder[]): WooContact[] {
  const byId = new Map<string, WooContact>();

  for (const order of orders) {
    const contact = toContact(order);
    if (!contact) continue;

    const existing = byId.get(contact.external_id);
    if (!existing) {
      byId.set(contact.external_id, contact);
      continue;
    }

    const [older, newer] = contact.seen_at >= existing.seen_at
      ? [existing, contact]
      : [contact, existing];

    byId.set(contact.external_id, {
      external_id: newer.external_id,
      full_name:    newer.full_name    ?? older.full_name,
      email:        newer.email        ?? older.email,
      number:       newer.number       ?? older.number,
      name_company: newer.name_company ?? older.name_company,
      region:       newer.region       ?? older.region,
      settlement:   newer.settlement   ?? older.settlement,
      address:      newer.address      ?? older.address,
      seen_at:      newer.seen_at,
    });
  }

  return [...byId.values()];
}
