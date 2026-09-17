/**
 * Read-only: reports whether the database has what the WooCommerce import
 * needs. Run it before deploying, and again after applying the migrations.
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
console.log('tables:', tables.map((t) => t.table_name).join(', ') || '(none)');

const { rows: columns } = await client.query(
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'account'`,
);
const have = new Map(columns.map((c) => [c.column_name, c.data_type]));

console.log('\naccount columns needed by the import:');
let missing = 0;
for (const [name, type] of [['source', 'character varying'], ['external_id', 'character varying'], ['source_data', 'jsonb']]) {
  const actual = have.get(name);
  if (!actual) { missing++; console.log(`  MISSING  ${name}  (expected ${type})`); }
  else console.log(`  ok       ${name}  ${actual}`);
}

const hasState = tables.some((t) => t.table_name === 'integration_state');
console.log(`\nintegration_state table: ${hasState ? 'ok' : 'MISSING'}`);
if (!hasState) missing++;

const { rows: idx } = await client.query(
  `SELECT indexname FROM pg_indexes
   WHERE tablename = 'account' AND indexname = 'account_source_external_id_key'`,
);
console.log(`unique (source, external_id) index: ${idx.length ? 'ok' : 'MISSING'}`);
if (!idx.length) missing++;

// Duplicate emails matter once importing starts: findByEmail at login picks one
// row arbitrarily when there is more than one.
if (have.has('email')) {
  const { rows: dupes } = await client.query(
    `SELECT count(*)::int AS groups FROM (
       SELECT lower(email) FROM account WHERE email IS NOT NULL AND email <> ''
       GROUP BY 1 HAVING count(*) > 1
     ) d`,
  );
  const { rows: total } = await client.query('SELECT count(*)::int AS n FROM account');
  console.log(`\naccounts: ${total[0].n}`);
  console.log(`duplicate emails already present: ${dupes[0].groups} group(s)`);
}

if (have.has('source')) {
  const { rows: bySource } = await client.query(
    'SELECT source, count(*)::int AS n FROM account GROUP BY source ORDER BY n DESC',
  );
  console.log('by source:', bySource.map((r) => `${r.source}=${r.n}`).join(' '));
}

console.log(missing === 0
  ? '\nSchema is ready.'
  : `\n${missing} thing(s) missing - apply migrations/001 and 002 first.`);

await client.end();
