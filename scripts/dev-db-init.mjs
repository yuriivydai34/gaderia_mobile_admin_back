/**
 * Creates the schema in a LOCAL development database from the TypeORM entities,
 * so there is somewhere to try migrations and the WooCommerce import before
 * anything touches production.
 *
 *   docker run -d --name gaderia-pg -p 55432:5432 \
 *     -e POSTGRES_USER=gaderia -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=gaderia_dev \
 *     postgres:16
 *
 *   node scripts/dev-db-init.mjs              # create tables from the entities
 *   node scripts/dev-db-init.mjs --as-prod    # then strip what migrations add,
 *                                             # so 001 can be tested for real
 *
 * Refuses to run against anything but a local host: `synchronize` rewrites the
 * schema to match the entities, which must never happen to the real database.
 */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { DataSource } from 'typeorm';

import { Account } from '../dist/account/account.entity.js';
import { Payment } from '../dist/payment/payment.entity.js';
import { Catalog } from '../dist/catalog/catalog.entity.js';
import { Shift } from '../dist/shift/shift.entity.js';
import { Customer } from '../dist/customer/customer.entity.js';
import { IntegrationState } from '../dist/integration/woocommerce/integration-state.entity.js';

try {
  const env = readFileSync(new URL('../.env.dev', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env.dev - fall back to the defaults below */ }

const host = process.env.DEV_DB_HOST ?? 'localhost';
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing to run against "${host}". This script is for a local database only.`);
  process.exit(1);
}

const ds = new DataSource({
  type: 'postgres',
  host,
  port: Number(process.env.DEV_DB_PORT) || 55432,
  username: process.env.DEV_DB_USER ?? 'gaderia',
  password: process.env.DEV_DB_PASSWORD ?? 'devpass',
  database: process.env.DEV_DB_NAME ?? 'gaderia_dev',
  entities: [Account, Payment, Catalog, Shift, Customer, IntegrationState],
  synchronize: true,
  logging: false,
});

await ds.initialize();

if (process.argv.includes('--as-prod')) {
  // Put the database back to what production looks like today, so applying
  // migrations/001 exercises the real upgrade path.
  await ds.query('DROP TABLE IF EXISTS customer');
  await ds.query('DROP TABLE IF EXISTS integration_state');
  console.log('schema rewound to the current production shape');
} else {
  console.log('schema created from the entities');
}

const tables = await ds.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' ORDER BY table_name`,
);
console.log('tables:', tables.map((t) => t.table_name).join(', '));

await ds.destroy();
