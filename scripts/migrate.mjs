/**
 * Applies the SQL files in migrations/ and records which ones have run.
 *
 *   node scripts/migrate.mjs             apply everything not yet applied
 *   node scripts/migrate.mjs --check     report what is pending, change nothing
 *   node scripts/migrate.mjs --baseline  record every file as applied, run none
 *
 * A remote database needs --remote as well. .env in this repository points
 * straight at production, so without that guard any run from a laptop reaches
 * the live data by default - which is exactly how the first test run of this
 * script created schema_migrations on production and re-ran 001.
 *
 * --baseline is for adopting a database whose schema is already up to date,
 * which is the state production is in: 001, 002 and 003 were applied by hand
 * long before this runner existed. Recording them is right; re-running 003
 * would rewrite the account table for nothing.
 *
 * Why this exists. One database is read by two codebases - this admin through
 * TypeORM and the app server through Sequelize - and neither generates schema:
 * synchronize is false here, and the app server never calls sync(). So the
 * schema is changed by hand, and twice nobody noticed it had not been: a
 * column existed in a model but not in the database, every query to that table
 * failed with 42703, and one of those went unnoticed for 27 hours.
 *
 * Plain SQL rather than sequelize-cli or TypeORM migrations, precisely because
 * two different ORMs read these tables. An ORM-specific tool would generate
 * changes from one side's models and treat the other side's as drift.
 *
 * Each file manages its own transaction - all of them open with BEGIN and end
 * with COMMIT - so this script does not wrap them in another one; a nested
 * BEGIN would make the file's own COMMIT close the wrapper instead. The record
 * of a successful run is therefore written just after the file commits, not
 * inside it. If the process dies in between, the migration stays unrecorded
 * and runs again next time. That is harmless: every file here is written to be
 * safe to re-run, which is the same property that let this runner be
 * introduced without having to guess what production had already received.
 *
 * Reads DB_* from .env, the same names src/app.module.ts uses.
 */

import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

const checkOnly = process.argv.includes('--check');
const baseline = process.argv.includes('--baseline');
const allowRemote = process.argv.includes('--remote');

try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env - use the real environment */ }

const directory = new URL('../migrations/', import.meta.url);

// Sorted by name, which is what the 001_/002_ prefixes are for: the order has
// to be the same on every machine and in every run.
const files = readdirSync(directory).filter((f) => f.endsWith('.sql')).sort();

if (files.length === 0) {
  console.log('migrations/: no .sql files');
  process.exit(0);
}

const host = process.env.DB_HOST ?? 'localhost';
const isLocal = ['localhost', '127.0.0.1', '::1', ''].includes(host);

// --check only reads, so it is allowed anywhere; anything that writes is not.
if (!isLocal && !allowRemote && !checkOnly) {
  console.error(`Refusing to write to ${host}/${process.env.DB_NAME}: that is not a local database.`);
  console.error('Add --remote if you really mean this one.');
  process.exit(1);
}

const client = new pg.Client({
  host,
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

// --check must not write, not even this table: it runs on every deploy, and a
// deploy has no business creating anything. A database without the table has
// simply had nothing recorded yet.
if (!checkOnly) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       varchar PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

const { rows: applied } = await client.query(`
  SELECT name FROM schema_migrations
  WHERE to_regclass('public.schema_migrations') IS NOT NULL
`).catch(() => ({ rows: [] }));
const done = new Set(applied.map((r) => r.name));
const pending = files.filter((f) => !done.has(f));

for (const file of files) {
  if (done.has(file)) console.log(`  ok       ${file}`);
}

if (pending.length === 0) {
  console.log(`\nup to date - ${files.length} migration(s) applied`);
  await client.end();
  process.exit(0);
}

for (const file of pending) console.log(`  PENDING  ${file}`);

if (baseline) {
  for (const file of pending) {
    await client.query(
      'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
      [file],
    );
  }
  console.log(`\n${pending.length} migration(s) recorded as applied, none were run`);
  await client.end();
  process.exit(0);
}

if (checkOnly) {
  // Deploy runs this. Failing here is the point: it stops a release going out
  // while the database is still missing what the new code expects.
  console.error(`\n${pending.length} migration(s) not applied to ${process.env.DB_NAME}.`);
  console.error('Apply them with:  node scripts/migrate.mjs');
  await client.end();
  process.exit(1);
}

console.log('');

for (const file of pending) {
  const sql = readFileSync(new URL(file, directory), 'utf8');
  process.stdout.write(`applying ${file} ... `);

  try {
    await client.query(sql);
  } catch (error) {
    console.log('FAILED');
    console.error(`\n${file}: ${error.message}`);
    // Whatever the file had already committed stays committed, and it is not
    // recorded, so the next run starts it again from the top.
    console.error('\nNothing was recorded for this file. Fix it and run again.');
    await client.end();
    process.exit(1);
  }

  await client.query(
    'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
    [file],
  );
  console.log('done');
}

console.log(`\n${pending.length} migration(s) applied`);
await client.end();
