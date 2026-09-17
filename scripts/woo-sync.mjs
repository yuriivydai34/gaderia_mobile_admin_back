/**
 * Runs the WooCommerce import from the command line, using the same service the
 * hourly job and the admin panel button use. Handy for the first full import,
 * which takes a few minutes, and for running it on the server without a token.
 *
 *   node scripts/woo-sync.mjs           # incremental, from the stored cursor
 *   node scripts/woo-sync.mjs --full    # ignore the cursor and read everything
 *
 * Reads WOO_* and DB_* from .env. Writes to whatever DB_HOST points at, so
 * check that first.
 */

import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { DataSource } from 'typeorm';

import { Customer } from '../dist/customer/customer.entity.js';
import { IntegrationState } from '../dist/integration/woocommerce/integration-state.entity.js';
import { WooClient } from '../dist/integration/woocommerce/woo.client.js';
import { WooSyncService } from '../dist/integration/woocommerce/woo-sync.service.js';

try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env - use the real environment */ }

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'your_database_name',
  entities: [Customer, IntegrationState],
  synchronize: false,
  logging: false,
});

await ds.initialize();
console.log(`connected to ${ds.options.host}:${ds.options.port}/${ds.options.database}`);

const sync = new WooSyncService(
  ds.getRepository(Customer),
  ds.getRepository(IntegrationState),
  new WooClient(),
);

const full = process.argv.includes('--full');
console.log(full ? 'full import' : `incremental from ${(await sync.getCursor()) ?? 'the beginning'}`);

const started = Date.now();
try {
  const result = await sync.sync({ full });
  console.log(`\nfinished in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(result);
} catch (error) {
  console.error('\nsync failed:', error.message ?? error);
  process.exitCode = 1;
} finally {
  await ds.destroy();
}
