/**
 * Read-only: reports whether the database has what the WooCommerce import
 * needs. Run it before deploying, and again after applying the migration.
 *
 *   node scripts/check-schema.mjs
 *
 * Reads DB_* from .env, the same names src/app.module.ts uses.
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

const client = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'your_database_name',
});

try {
  await client.connect();
} catch (error) {
  console.error(`Cannot connect to ${process.env.DB_HOST ?? 'localhost'}/${process.env.DB_NAME ?? '(default)'}:`);
  console.error(`  ${error.message}`);
  console.error('\nSet DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD in .env.');
  process.exit(1);
}

const { rows: tables } = await client.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' ORDER BY table_name`,
);
const present = new Set(tables.map((t) => t.table_name));
console.log('tables:', [...present].join(', ') || '(none)');

let missing = 0;

console.log('\nwhat the import needs:');
for (const table of ['customer', 'integration_state']) {
  if (present.has(table)) console.log(`  ok       table ${table}`);
  else { missing++; console.log(`  MISSING  table ${table}`); }
}

if (present.has('customer')) {
  const { rows: columns } = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'customer'`,
  );
  const have = new Map(columns.map((c) => [c.column_name, c.data_type]));
  for (const [name, type] of [
    ['source', 'character varying'],
    ['external_id', 'character varying'],
    ['source_data', 'jsonb'],
  ]) {
    const actual = have.get(name);
    if (!actual) { missing++; console.log(`  MISSING  customer.${name} (expected ${type})`); }
    else console.log(`  ok       customer.${name}  ${actual}`);
  }

  const { rows: idx } = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'customer' AND indexname = 'customer_source_external_id_key'`,
  );
  if (idx.length) console.log('  ok       unique (source, external_id)');
  else { missing++; console.log('  MISSING  unique (source, external_id)'); }

  const { rows: counts } = await client.query(
    'SELECT source, count(*)::int AS n FROM customer GROUP BY source ORDER BY n DESC',
  );
  console.log('\ncustomers imported:', counts.map((r) => `${r.source}=${r.n}`).join(' ') || '(none yet)');
}

// `account` must be left alone: it is the login table, and imported buyers do
// not belong in it.
if (present.has('account')) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'account'
       AND column_name IN ('source', 'external_id', 'source_data')`,
  );
  console.log(rows.length === 0
    ? '\naccount: untouched, as intended'
    : `\naccount: unexpectedly has ${rows.map((r) => r.column_name).join(', ')} - left over from an earlier attempt`);

  const { rows: total } = await client.query('SELECT count(*)::int AS n FROM account');
  console.log('app accounts:', total[0].n);
}

const { rows: cursor } = present.has('integration_state')
  ? await client.query(`SELECT key, value FROM integration_state`)
  : { rows: [] };
if (cursor.length) console.log('sync cursor:', cursor.map((r) => `${r.key}=${r.value}`).join(' '));

console.log(missing === 0
  ? '\nSchema is ready.'
  : `\n${missing} thing(s) missing - apply migrations/001_customer_import.sql first.`);

await client.end();
