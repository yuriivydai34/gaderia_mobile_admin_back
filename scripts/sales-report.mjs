/**
 * Where the sales came from, over a period: paid Meta, paid Google, the app,
 * and everything else (organic, direct, referrals).
 *
 *   node scripts/sales-report.mjs                 # last 6 months
 *   node scripts/sales-report.mjs --months=12
 *   node scripts/sales-report.mjs --from=2026-01-01 --to=2026-06-30
 *   node scripts/sales-report.mjs --csv > report.csv
 *   node scripts/sales-report.mjs --unmapped      # what the guesses missed
 *
 * Reads WOO_* and DB_* from .env. The numbers stay on the machine that runs
 * it; nothing is sent anywhere.
 *
 * Two sources, because the two shops are separate:
 *   - the website: WooCommerce orders, with the attribution WooCommerce
 *     records per order (_wc_order_attribution_*);
 *   - the app: our own `payment` table, which records no attribution at all -
 *     an app sale is simply an app sale.
 *
 * An order the app pushed into WooCommerce (_order_source = app) is left out
 * of the website's side, or it would be counted in both.
 *
 * Only completed orders count as a sale, the same rule the customer list uses:
 * a cancelled order is not revenue. Cancellations are reported beside the
 * totals so a channel that sells a lot and loses a lot is not flattered.
 */

import { readFileSync } from 'node:fs';
import pg from 'pg';

try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env - use the real environment */ }

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const months = Number(arg('months', 6));
const to = arg('to') ? new Date(`${arg('to')}T23:59:59Z`) : new Date();
const from = arg('from')
  ? new Date(`${arg('from')}T00:00:00Z`)
  : new Date(to.getTime() - months * 30.44 * 24 * 3600 * 1000);

const iso = (d) => d.toISOString().slice(0, 19);
const day = (d) => d.toISOString().slice(0, 10);

/**
 * Which channel an order belongs to.
 *
 * Read off what the shop actually records, not off a textbook: utm_source
 * holds `fb` and `ig` for the paid social, `google` for Google, `(direct)`
 * for someone who typed the address in. utm_medium is not trusted for the
 * split - several campaigns put their whole name in it.
 *
 * Google only counts as paid when the visit was tagged (source_type `utm`);
 * arriving from a Google search is organic and belongs in the last column.
 */
const META = /(^|\.)(fb|ig|facebook|instagram|meta)(\.|$|-)/i;
const GOOGLE = /(^|\.)google(\.|$|quicksearchbox)/i;

function channelOf(order) {
  const meta = (key) =>
    String((order.meta_data ?? []).find((m) => m.key === key)?.value ?? '').trim();

  if (meta('_order_source') === 'app') return 'app';

  const source = meta('_wc_order_attribution_utm_source');
  const type = meta('_wc_order_attribution_source_type');

  if (META.test(source)) return 'meta';
  if (GOOGLE.test(source) && type === 'utm') return 'google';
  return 'organic';
}

const LABEL = {
  meta: 'Мета (Facebook / Instagram)',
  google: 'Google (платний)',
  app: 'Застосунок',
  organic: 'Органіка, прямі заходи, реферали',
};
const ORDER = ['meta', 'google', 'app', 'organic'];

function blank() {
  return { orders: 0, revenue: 0, cancelled: 0, cancelledRevenue: 0 };
}

// ---------------------------------------------------------------- website

async function websiteOrders() {
  const raw = (process.env.WOO_URL ?? '').replace(/\/+$/, '');
  if (!raw) throw new Error('WOO_URL is not set');
  const base = /\/wp-json\/wc\/v\d+$/.test(raw) ? raw : `${raw}/wp-json/wc/v3`;
  const auth = Buffer.from(
    `${process.env.WOO_CONSUMER_KEY}:${process.env.WOO_CONSUMER_SECRET}`,
  ).toString('base64');

  const orders = [];
  for (let page = 1; ; page++) {
    const url = new URL(`${base}/orders`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('after', iso(from));
    url.searchParams.set('before', iso(to));
    url.searchParams.set('dates_are_gmt', 'true');
    url.searchParams.set('orderby', 'date');
    url.searchParams.set('order', 'asc');

    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const batch = await res.json();
    orders.push(...batch);
    if (batch.length < 100) break;
  }
  return orders;
}

// -------------------------------------------------------------------- app

async function appOrders() {
  const client = new pg.Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'your_database_name',
  });
  await client.connect();
  try {
    // createdAt is a unix timestamp here, not a date - the app's own column.
    const { rows } = await client.query(
      `SELECT status, count(*)::int AS orders, COALESCE(sum(amount), 0)::float AS revenue
       FROM payment
       WHERE to_timestamp("createdAt") >= $1 AND to_timestamp("createdAt") <= $2
       GROUP BY status`,
      [from, to],
    );
    return rows;
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------- report

const totals = Object.fromEntries(ORDER.map((k) => [k, blank()]));
const unmapped = new Map();

const site = await websiteOrders();
for (const order of site) {
  const channel = channelOf(order);
  const bucket = totals[channel];
  const amount = Number(order.total) || 0;

  if (order.status === 'completed') {
    bucket.orders++;
    bucket.revenue += amount;
    if (channel === 'organic') {
      const source =
        String((order.meta_data ?? []).find((m) => m.key === '_wc_order_attribution_utm_source')?.value ?? '') ||
        '(нічого не записано)';
      unmapped.set(source, (unmapped.get(source) ?? 0) + 1);
    }
  } else if (order.status === 'cancelled' || order.status === 'failed' || order.status === 'refunded') {
    bucket.cancelled++;
    bucket.cancelledRevenue += amount;
  }
}

for (const row of await appOrders()) {
  const bucket = totals.app;
  if (row.status === 'COMPLETED') {
    bucket.orders += row.orders;
    bucket.revenue += row.revenue;
  } else if (row.status === 'CANCELED') {
    bucket.cancelled += row.orders;
    bucket.cancelledRevenue += row.revenue;
  }
}

const grand = ORDER.reduce(
  (a, k) => ({
    orders: a.orders + totals[k].orders,
    revenue: a.revenue + totals[k].revenue,
    cancelled: a.cancelled + totals[k].cancelled,
    cancelledRevenue: a.cancelledRevenue + totals[k].cancelledRevenue,
  }),
  blank(),
);

const money = (n) => Math.round(n).toLocaleString('uk-UA');
const share = (n) => (grand.revenue ? ((n / grand.revenue) * 100).toFixed(1) : '0.0');

if (flag('csv')) {
  console.log('Канал;Замовлень;Виручка, грн;Частка, %;Скасовано;Скасовано, грн');
  for (const key of ORDER) {
    const t = totals[key];
    console.log(
      `${LABEL[key]};${t.orders};${Math.round(t.revenue)};${share(t.revenue)};${t.cancelled};${Math.round(t.cancelledRevenue)}`,
    );
  }
  console.log(
    `Разом;${grand.orders};${Math.round(grand.revenue)};100.0;${grand.cancelled};${Math.round(grand.cancelledRevenue)}`,
  );
} else {
  console.log(`\nПродажі з ${day(from)} по ${day(to)} — лише виконані замовлення\n`);
  console.log('Канал                                Замовлень      Виручка   Частка   Скасовано');
  console.log('─'.repeat(82));
  for (const key of ORDER) {
    const t = totals[key];
    console.log(
      `${LABEL[key].padEnd(36)}${String(t.orders).padStart(9)}${money(t.revenue).padStart(13)}${(share(t.revenue) + '%').padStart(9)}${String(t.cancelled).padStart(12)}`,
    );
  }
  console.log('─'.repeat(82));
  console.log(
    `${'Разом'.padEnd(36)}${String(grand.orders).padStart(9)}${money(grand.revenue).padStart(13)}${'100.0%'.padStart(9)}${String(grand.cancelled).padStart(12)}`,
  );
  console.log(
    `\nСайт: ${site.length} замовлень за період · застосунок рахується з таблиці payment,` +
      `\nзамовлення застосунку, що потрапили на сайт, у сайтову частину не враховані.`,
  );
}

if (flag('unmapped')) {
  console.log('\nЩо потрапило в «органіку» — за джерелом, як його записав сайт:');
  for (const [source, n] of [...unmapped].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${source}`);
  }
}
