/**
 * Creates/corrects the 26 single-bottle catalog products and the 2 ready-kit
 * products for juices by the bottle (owner's brief, 24.10.2026). Not a
 * migration: migrations/ is schema only (one ALTER TABLE per file, run on
 * every deploy); this writes rows, which belongs in a script, the same way
 * scripts/set-password.mjs does, run once by hand.
 *
 *   node scripts/own-sets-catalog.mjs             preview, writes nothing
 *   node scripts/own-sets-catalog.mjs --apply      write (local DB by default)
 *   node scripts/own-sets-catalog.mjs --apply --remote   write to production
 *
 * A product already in the catalog is matched by `article` (there is no
 * unique constraint on it, so this is a manual check-then-write, not
 * ON CONFLICT) and only its header, price and own_sets_role are corrected —
 * everything else (picture, shipment size, …) is left as a manager may have
 * already set it. A product with no matching article is inserted in full,
 * with a picture from the site's media library and shipment dimensions
 * copied from the matching pack of the same volume (own_sets_role='pack'),
 * since a loose bottle still ships in that pack's box.
 *
 * The two kit products (Набір 1 / Набір 2) are inserted hidden
 * (is_active=false): their article numbers are not yet confirmed by
 * accounting, and the single bottles are not to be ordered through the app
 * until the website has the matching products in WooCommerce. Flip
 * is_active by hand in the panel, alongside app_setting.own_sets_mode, once
 * that is ready.
 */

import { readFileSync } from 'node:fs';
import pg from 'pg';

const apply = process.argv.includes('--apply');
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

const host = process.env.DB_HOST ?? 'localhost';
const isLocal = ['localhost', '127.0.0.1', '::1', ''].includes(host);
if (apply && !isLocal && !allowRemote) {
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
  console.error(`Cannot connect to ${host}/${process.env.DB_NAME ?? '(default)'}: ${error.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The 26 bottles: owner's brief, 24.10.2026. header/price/article are the
// values to keep correct; the rest only matters for a brand new row (see
// pictureFor/boxFor below).
const BOTTLE_URL = (file) => `https://gaderia.com.ua/wp-content/uploads/2026/10/${file}`;

const FLAVOURS = {
  APPLE:           { ua: 'яблучний',       bottlePhoto: 'apple',       juicePhoto: null },
  APPLEGRAPE:      { ua: 'яблуко-виноград', bottlePhoto: 'grape',       juicePhoto: 'grape' },
  PEARAPPLE:       { ua: 'яблуко-груша',    bottlePhoto: 'pear',        juicePhoto: 'pear' },
  CARROTAPPLE:     { ua: 'яблуко-морква',   bottlePhoto: 'carrot',      juicePhoto: 'carrot' },
  STRAWBERRYAPPLE: { ua: 'яблуко-полуниця', bottlePhoto: 'strawberry',  juicePhoto: 'strawberry' },
  APPLEGINGER:     { ua: 'яблуко-імбир',    bottlePhoto: 'ginger',      juicePhoto: 'ginger' },
  APPLELEMON:      { ua: 'яблуко-лимон',    bottlePhoto: 'lemon',       juicePhoto: 'lemon' },
  APPLEBERRY:      { ua: 'фруктово-ягідний',bottlePhoto: 'fruit_berry', juicePhoto: 'berry_ua' },
};

function picture(juice, measurement) {
  const f = FLAVOURS[juice];
  if (!f) throw new Error(`Невідомий смак ${juice}`);
  if (measurement === 3) {
    return BOTTLE_URL(f.juicePhoto ? `gaderia_juice_${f.juicePhoto}_single.png` : 'gaderia_juice_single.png');
  }
  return BOTTLE_URL(`gaderia_bottle_only_${f.bottlePhoto}.jpg`);
}

// article -> { header, price, juice, measurement, pack_article }. pack_article
// is the own_sets_role='pack' product this bottle shares its box with, used
// only to fill shipment size for a brand new row.
const BOTTLES = [
  // 0,33 л — по 12 у коробці
  ['4820270970058', 'Сік яблучний, 0,33 л', 50, 'APPLE', 0.33, '2048202700111'],
  ['4820270970140', 'Сік яблуко-виноград, 0,33 л', 50, 'APPLEGRAPE', 0.33, '2048202700159'],
  ['4820270970096', 'Сік яблуко-груша, 0,33 л', 50, 'PEARAPPLE', 0.33, '2048202700135'],
  ['4820270970102', 'Сік яблуко-морква, 0,33 л', 50, 'CARROTAPPLE', 0.33, '2048202700128'],
  ['4820270970119', 'Сік яблуко-полуниця, 0,33 л', 55, 'STRAWBERRYAPPLE', 0.33, '2048202700142'],
  ['4820270970416', 'Сік яблуко-імбир, 0,33 л', 50, 'APPLEGINGER', 0.33, '2048202700234'],
  ['4820270970447', 'Сік яблуко-лимон, 0,33 л', 50, 'APPLELEMON', 0.33, '2048202700241'],
  ['4820270970379', 'Сік фруктово-ягідний, 0,33 л', 55, 'APPLEBERRY', 0.33, '2048202700258'],
  // 1 л — по 6 у коробці
  ['4820270970034', 'Сік яблучний, 1 л', 115, 'APPLE', 1, '2048202700067'],
  ['4820270970133', 'Сік яблуко-виноград, 1 л', 115, 'APPLEGRAPE', 1, '2048202700104'],
  ['4820270970089', 'Сік яблуко-груша, 1 л', 115, 'PEARAPPLE', 1, '2048202700081'],
  ['4820270970072', 'Сік яблуко-морква, 1 л', 115, 'CARROTAPPLE', 1, '2048202700074'],
  ['4820270970065', 'Сік яблуко-полуниця, 1 л', 135, 'STRAWBERRYAPPLE', 1, '2048202700098'],
  ['4820270970423', 'Сік яблуко-імбир, 1 л', 120, 'APPLEGINGER', 1, '2048202700265'],
  ['4820270970454', 'Сік яблуко-лимон, 1 л', 120, 'APPLELEMON', 1, '2048202700272'],
  ['4820270970386', 'Сік фруктово-ягідний, 1 л', 130, 'APPLEBERRY', 1, '2048202700289'],
  // 3 л — по 2 упаковки в коробці (тут одиниця — упаковка, bag-in-box)
  ['4820270970010', 'Сік яблучний, 3 л', 225, 'APPLE', 3, '2048202700012'],
  ['4820270970188', 'Сік яблуко-виноград, 3 л', 250, 'APPLEGRAPE', 3, '2048202700029'],
  ['4820270970171', 'Сік яблуко-груша, 3 л', 255, 'PEARAPPLE', 3, '2048202700036'],
  ['4820270970164', 'Сік яблуко-морква, 3 л', 245, 'CARROTAPPLE', 3, '2048202700043'],
  ['4820270970157', 'Сік яблуко-полуниця, 3 л', 320, 'STRAWBERRYAPPLE', 3, '2048202700050'],
  // 1С-код саме такий, 12 цифр — підтверджено власником 24.10.2026.
  ['482027097430', 'Сік яблуко-імбир, 3 л', 270, 'APPLEGINGER', 3, '2048202700296'],
  ['4820270970461', 'Сік яблуко-лимон, 3 л', 265, 'APPLELEMON', 3, '2048202700302'],
  ['4820270970393', 'Сік фруктово-ягідний, 3 л', 300, 'APPLEBERRY', 3, '2048202700319'],
];

// Оцту правило кратності вимкнене (own-sets.ts), але це все одно "пляшка",
// продається поштучно без обмеження на кількість.
const VINEGAR = [
  ['4820270970126', 'Оцет нефільтрований, 0,5 л', 200, 'UNFILTERED', BOTTLE_URL('gaderia_vinegar_single.jpg'), '2048202700180'],
  ['4820270970041', 'Оцет фільтрований, 0,5 л', 160, 'FILTERED', 'https://gaderia.com.ua/wp-content/uploads/2023/09/oczet-2.webp', '2048202700173'],
];

// Артикули не підтверджені бухгалтерією (24.10.2026) — міняти лише тут.
const KIT_ARTICLES = {
  kit1: '2048202700333',
  kit2: '2048202700340',
};
const KITS = [
  {
    article: KIT_ARTICLES.kit1,
    header: 'Набір соків ТМ Gaderia «Набір 1», 1 л х 6 пляшок',
    price: 735,
    // Плейсхолдер для панелі (вона вимагає смак для типу "Сік") — перший
    // смак набору, як і в наборі-дегустації (id 81 на проді).
    placeholderJuice: 'PEARAPPLE',
  },
  {
    article: KIT_ARTICLES.kit2,
    header: 'Набір соків ТМ Gaderia «Набір 2», 1 л х 6 пляшок',
    price: 720,
    placeholderJuice: 'APPLE',
  },
];

// ---------------------------------------------------------------------------

async function packBox(article) {
  const { rows } = await client.query(
    `SELECT shipment_weight, shipment_length, shipment_width, shipment_height, type_packaging
       FROM catalog WHERE article = $1 AND own_sets_role = 'pack' LIMIT 1`,
    [article],
  );
  return rows[0] ?? null;
}

async function nextSort() {
  const { rows } = await client.query(`SELECT COALESCE(MAX(id_sort), 0) + 1 AS next FROM catalog`);
  return rows[0].next;
}

async function upsertBottle(article, header, price, measurement, packArticle, { typeProduct, typeJuice, typeVinegar, pictureUrl }) {
  const { rows } = await client.query('SELECT id, header, price, own_sets_role FROM catalog WHERE article = $1', [article]);
  if (rows[0]) {
    const row = rows[0];
    const changed = row.header !== header || Number(row.price) !== price || row.own_sets_role !== 'single';
    console.log(`${changed ? 'UPDATE' : '   ok '} #${row.id} ${article} ${header} — ${price} грн`);
    if (apply && changed) {
      await client.query(
        `UPDATE catalog SET header = $1, price = $2, price_discount = 0, is_discount = false, own_sets_role = 'single', "updatedAt" = now() WHERE article = $3`,
        [header, price, article],
      );
    }
    return;
  }

  const box = await packBox(packArticle);
  if (!box) console.warn(`  ! немає коробки-зразка ${packArticle} для ${article} — габарити не задані`);
  console.log(`INSERT        ${article} ${header} — ${price} грн${box ? '' : ' (без габаритів!)'}`);
  if (!apply) return;

  await client.query(
    `INSERT INTO catalog
       (header, price, price_discount, is_discount, type_product, type_juice, type_vinegar,
        measurement, type_measurement, type_packaging, shipment_weight, shipment_length,
        shipment_width, shipment_height, article, is_active, own_sets_role, id_sort, picture,
        "createdAt", "updatedAt")
     VALUES ($1,$2,0,false,$3,$4,$5,$6,'LITER',$7,$8,$9,$10,$11,$12,true,'single',$13,$14, now(), now())`,
    [
      header, price, typeProduct, typeJuice ?? null, typeVinegar ?? null, measurement,
      box?.type_packaging ?? (measurement === 3 ? 'BAGINBOX' : 'GLASS'),
      box?.shipment_weight ?? null, box?.shipment_length ?? null, box?.shipment_width ?? null, box?.shipment_height ?? null,
      article, await nextSort(), pictureUrl,
    ],
  );
}

async function upsertKit(kit) {
  const { rows } = await client.query('SELECT id, header, price FROM catalog WHERE article = $1', [kit.article]);
  if (rows[0]) {
    const row = rows[0];
    const changed = row.header !== kit.header || Number(row.price) !== kit.price;
    console.log(`${changed ? 'UPDATE' : '   ok '} #${row.id} ${kit.article} ${kit.header} — ${kit.price} грн`);
    if (apply && changed) {
      await client.query(
        `UPDATE catalog SET header = $1, price = $2, price_discount = 0, is_discount = false, "updatedAt" = now() WHERE article = $3`,
        [kit.header, kit.price, kit.article],
      );
    }
    return;
  }

  console.log(`INSERT        ${kit.article} ${kit.header} — ${kit.price} грн (приховано, is_active=false)`);
  if (!apply) return;

  // 9 кг, 28×19×26 — та сама коробка, що й у коробок 1 л (гілка
  // яблуко-імбир/лимон/фруктово-ягідний, ваговано заміряна).
  await client.query(
    `INSERT INTO catalog
       (header, price, price_discount, is_discount, type_product, type_juice,
        measurement, type_measurement, type_packaging, shipment_weight, shipment_length,
        shipment_width, shipment_height, article, is_active, own_sets_role, id_sort,
        "createdAt", "updatedAt")
     VALUES ($1,$2,0,false,'JUICE',$3,6,'LITER','GLASS',9,28,19,26,$4,false,NULL,$5, now(), now())`,
    [kit.header, kit.price, kit.placeholderJuice, kit.article, await nextSort()],
  );
}

async function run() {
  console.log(apply ? `Записую в ${host}/${process.env.DB_NAME}…\n` : 'Перевірка (нічого не змінюю):\n');

  for (const [article, header, price, juice, measurement, packArticle] of BOTTLES) {
    await upsertBottle(article, header, price, measurement, packArticle, {
      typeProduct: 'JUICE', typeJuice: juice, pictureUrl: picture(juice, measurement),
    });
  }
  for (const [article, header, price, vinegar, pictureUrl, packArticle] of VINEGAR) {
    await upsertBottle(article, header, price, 0.5, packArticle, {
      typeProduct: 'VINEGAR', typeVinegar: vinegar, pictureUrl,
    });
  }
  console.log();
  for (const kit of KITS) await upsertKit(kit);

  console.log(apply ? '\nЗроблено.' : '\nПерегляньте вивід і запустіть ще раз з --apply, щоб записати.');
}

try {
  await run();
} finally {
  await client.end();
}
