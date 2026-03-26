import { db } from '../db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getLogger } from '../logger.js';

const logger = getLogger('catalog-service:postgres');
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

export class PostgresRepository {
  async listProducts() {
    return db.any('SELECT * FROM products ORDER BY name');
  }

  async getProduct(id) {
    return db.oneOrNone('SELECT * FROM products WHERE id = $1', [id]);
  }

  async searchProducts(query) {
    const q = `%${query.toLowerCase()}%`;
    return db.any(
      `SELECT * FROM products
       WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1
       ORDER BY name`,
      [q],
    );
  }

  async seed() {
    await db.none(CREATE_TABLE);

    const count = await db.one('SELECT COUNT(*) FROM products', [], r => +r.count);
    if (count > 0) {
      logger.info('database already seeded', { count });
      return;
    }

    const products = JSON.parse(
      readFileSync(path.join(__dirname, '../data/products.json'), 'utf8'),
    );

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

    logger.info('seeded products', { count: products.length });
  }

  async ping() {
    await db.one('SELECT 1');
  }
}
