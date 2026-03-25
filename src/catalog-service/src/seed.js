import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { db } from './db.js';
import { getLogger } from './logger.js';

const logger = getLogger('catalog-service:seed');
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS products (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    description         TEXT,
    picture             TEXT,
    price_currency_code TEXT,
    price_units         BIGINT,
    price_nanos         INTEGER,
    categories          TEXT[]
  )
`;

export async function seedDatabase() {
  await db.none(CREATE_TABLE);

  const count = await db.one('SELECT COUNT(*) FROM products', [], r => +r.count);
  if (count > 0) {
    logger.info(`database already seeded`, { count });
    return;
  }

  const products = JSON.parse(readFileSync(path.join(__dirname, './data/products.json'), 'utf8'));

  await db.tx(async t => {
    for (const p of products) {
      await t.none(
        `INSERT INTO products
           (id, name, description, picture, price_currency_code, price_units, price_nanos, categories)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          p.id,
          p.name,
          p.description,
          p.picture,
          p.price_currency_code,
          p.price_units,
          p.price_nanos,
          p.categories,
        ],
      );
    }
  });

  logger.info(`seeded products`, { count: products.length });
}
