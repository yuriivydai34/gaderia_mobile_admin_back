/**
 * Sets an account's password, the same way register() does: bcrypt over the
 * password with PASSWORD_PEPPER appended. Writing a hash into the table by hand
 * will not work without that pepper.
 *
 *   node scripts/set-password.mjs someone@example.com
 *
 * Prompts for the password with the echo off. A password can be piped instead
 * when scripting:
 *
 *   echo 'new-password' | node scripts/set-password.mjs someone@example.com
 *
 * Passing it as an argument is supported but discouraged - it lands in the
 * shell history and in the process list.
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import bcrypt from 'bcrypt';
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

const [email, passwordArg] = process.argv.slice(2);

if (!email) {
  console.error('Usage: node scripts/set-password.mjs <email> [password]');
  process.exit(1);
}

if (process.env.PASSWORD_PEPPER === undefined) {
  console.error('PASSWORD_PEPPER is not set. Without it the new password would not match at login.');
  process.exit(1);
}

async function readPassword() {
  if (passwordArg) {
    console.warn('Warning: the password was passed as an argument, so it is in your shell history.');
    return passwordArg;
  }
  if (!process.stdin.isTTY) {
    return (await new Promise((resolve) => {
      let data = '';
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => resolve(data));
    })).trim();
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const ask = (question) => new Promise((resolve) => {
    process.stdout.write(question);
    // Mute the echo so the password is not left on screen.
    const onData = () => { rl.output.write('\x1B[2K\x1B[200D' + question); };
    rl.input.on('data', onData);
    rl.question('', (answer) => {
      rl.input.off('data', onData);
      process.stdout.write('\n');
      resolve(answer);
    });
  });

  const first = await ask('New password: ');
  const second = await ask('Repeat: ');
  rl.close();
  if (first !== second) {
    console.error('The two passwords do not match.');
    process.exit(1);
  }
  return first;
}

const password = await readPassword();
if (password.length < 8) {
  console.error('Refusing to set a password shorter than 8 characters.');
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'your_database_name',
});

await client.connect();

const { rows: found } = await client.query(
  'SELECT id, email, full_name, role FROM account WHERE lower(email) = lower($1)',
  [email],
);

if (found.length === 0) {
  console.error(`No account with email ${email}.`);
  await client.end();
  process.exit(1);
}
if (found.length > 1) {
  // Duplicate emails are possible: there is no unique index on account.email.
  console.error(`${found.length} accounts share that email (ids ${found.map((a) => a.id).join(', ')}). Resolve that first.`);
  await client.end();
  process.exit(1);
}

const account = found[0];
const hash = await bcrypt.hash(password + process.env.PASSWORD_PEPPER, 10);
await client.query('UPDATE account SET password = $1 WHERE id = $2', [hash, account.id]);

// Prove the stored hash actually validates, rather than trusting that it does.
const { rows: [stored] } = await client.query('SELECT password FROM account WHERE id = $1', [account.id]);
const valid = await bcrypt.compare(password + process.env.PASSWORD_PEPPER, stored.password);

console.log(`Password set for #${account.id} ${account.full_name ?? ''} <${account.email}> role=${account.role ?? 'null'}`);
console.log(valid ? 'Verified: the new password matches the stored hash.' : 'WARNING: the stored hash does not verify.');

await client.end();
process.exit(valid ? 0 : 1);
