/**
 * Read-only reconnaissance against the live shop. Writes nothing, changes
 * nothing - it only asks WooCommerce what its orders actually look like, so the
 * import mapping is based on this shop rather than on the generic API docs.
 *
 *   WOO_URL=https://shop.example.com \
 *   WOO_CONSUMER_KEY=ck_xxx WOO_CONSUMER_SECRET=cs_xxx \
 *   node scripts/woo-probe.mjs
 */

// Pick up a local .env so the keys never have to be typed on the command line.
try {
  const { readFileSync } = await import('node:fs');
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env - fall back to the real environment */ }

const url = (process.env.WOO_URL ?? '').replace(/\/+$/, '');
const key = process.env.WOO_CONSUMER_KEY;
const secret = process.env.WOO_CONSUMER_SECRET;

if (!url || !key || !secret) {
  console.error('Set WOO_URL, WOO_CONSUMER_KEY and WOO_CONSUMER_SECRET first.');
  process.exit(1);
}

const auth = Buffer.from(`${key}:${secret}`).toString('base64');

async function get(path, params = {}) {
  const endpoint = new URL(`${url}/wp-json/wc/v3/${path}`);
  for (const [k, v] of Object.entries(params)) endpoint.searchParams.set(k, String(v));
  const res = await fetch(endpoint.toString(), {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { ok: res.ok, status: res.status, headers: res.headers, body };
}

function section(title) { console.log(`\n=== ${title} ===`); }

// 1. Can we talk to it at all, and how much is there?
section('connection');
const first = await get('orders', { per_page: 1 });
if (!first.ok) {
  console.error(`FAILED ${first.status}:`, first.body);
  process.exit(1);
}
console.log('total orders :', first.headers.get('x-wp-total'));
console.log('total pages  :', first.headers.get('x-wp-totalpages'), '(at per_page=1)');

// 2. The parameters the importer depends on. The docs do not list these for
//    orders, so ask the shop directly instead of assuming.
section('parameters the importer needs');
for (const [label, params] of [
  ['orderby=modified',  { per_page: 1, orderby: 'modified', order: 'asc' }],
  ['modified_after',    { per_page: 1, modified_after: '2020-01-01T00:00:00' }],
  ['dates_are_gmt',     { per_page: 1, modified_after: '2020-01-01T00:00:00', dates_are_gmt: 'true' }],
  ['after (fallback)',  { per_page: 1, after: '2020-01-01T00:00:00' }],
]) {
  const r = await get('orders', params);
  console.log(`${r.ok ? 'OK  ' : `FAIL ${r.status}`}  ${label}`,
    r.ok ? '' : JSON.stringify(r.body).slice(0, 160));
}

// 3. What a real order actually contains.
section('shape of the newest order');
const sample = (await get('orders', { per_page: 1, orderby: 'date', order: 'desc' })).body[0];
if (!sample) { console.log('no orders at all'); process.exit(0); }
console.log('top-level keys:', Object.keys(sample).join(', '));
console.log('\nbilling:', JSON.stringify(sample.billing, null, 2));
console.log('\ncustomer_id  :', sample.customer_id, '(0 means guest)');
console.log('date_modified_gmt:', sample.date_modified_gmt ?? '(absent)');
console.log('meta_data keys:', (sample.meta_data ?? []).map((m) => m.key).join(', ') || '(none)');

// 4. How usable the billing data is across a real sample - this decides
//    whether email alone is enough to identify people.
section('billing coverage over the last 100 orders');
const batch = (await get('orders', { per_page: 100, orderby: 'date', order: 'desc' })).body;
const stats = { total: batch.length, email: 0, phone: 0, neither: 0, guest: 0, company: 0, address1: 0 };
const states = new Map();
for (const o of batch) {
  const b = o.billing ?? {};
  if ((b.email ?? '').trim()) stats.email++;
  if ((b.phone ?? '').trim()) stats.phone++;
  if (!(b.email ?? '').trim() && !(b.phone ?? '').trim()) stats.neither++;
  if (!o.customer_id) stats.guest++;
  if ((b.company ?? '').trim()) stats.company++;
  if ((b.address_1 ?? '').trim()) stats.address1++;
  if ((b.state ?? '').trim()) states.set(b.state, (states.get(b.state) ?? 0) + 1);
}
console.log(stats);
console.log('distinct billing.state values:', [...states.keys()].slice(0, 12).join(' | ') || '(none)');
console.log('  ^ codes like UA-32 mean region needs a lookup table, not a copy');

// 5. Duplicate detection: how many people are actually behind these orders.
const emails = new Set(batch.map((o) => (o.billing?.email ?? '').trim().toLowerCase()).filter(Boolean));
console.log(`\n${batch.length} orders -> ${emails.size} distinct billing emails`);
