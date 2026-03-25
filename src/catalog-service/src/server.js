import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import path from 'path';
import { HealthImplementation } from 'grpc-health-check';
import { getLogger } from './logger.js';
import { db } from './db.js';
import { seedDatabase } from './seed.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const logger = getLogger('catalog-service');

const PROTO_PATH = path.join(__dirname, './proto/Catalog.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const { boutiqueshop } = grpc.loadPackageDefinition(packageDef);

function toProto(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    picture: row.picture || '',
    priceUsd: {
      currencyCode: row.price_currency_code,
      units: String(row.price_units),
      nanos: row.price_nanos,
    },
    categories: row.categories || [],
  };
}

async function listProducts(_call, callback) {
  try {
    const rows = await db.any('SELECT * FROM products ORDER BY name');
    callback(null, { products: rows.map(toProto) });
  } catch (err) {
    logger.error('listProducts failed', { error: err.message });
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function getProduct(call, callback) {
  try {
    const row = await db.oneOrNone(
      'SELECT * FROM products WHERE id = $1',
      [call.request.id]
    );
    if (!row) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `product ${call.request.id} not found`,
      });
    }
    callback(null, toProto(row));
  } catch (err) {
    logger.error('getProduct failed', { error: err.message });
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

async function searchProducts(call, callback) {
  try {
    const q = `%${call.request.query.toLowerCase()}%`;
    const rows = await db.any(
      `SELECT * FROM products
       WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1
       ORDER BY name`,
      [q]
    );
    callback(null, { results: rows.map(toProto) });
  } catch (err) {
    logger.error('searchProducts failed', { error: err.message });
    callback({ code: grpc.status.INTERNAL, message: err.message });
  }
}

const SERVICE_NAME = 'boutiqueshop.CatalogService';

async function main() {
  await seedDatabase();

  const health = new HealthImplementation({ '': 'NOT_SERVING', [SERVICE_NAME]: 'NOT_SERVING' });

  const server = new grpc.Server();
  server.addService(boutiqueshop.CatalogService.service, {
    listProducts,
    getProduct,
    searchProducts,
  });
  health.addToServer(server);

  server.bindAsync('0.0.0.0:5002', grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      logger.error('failed to bind', { error: err.message });
      process.exit(1);
    }
    logger.info(`catalog-service listening on port ${port}`);
  });

  // Mark serving after successful seed, then probe DB every 30s
  await setHealthStatus(health, true);
  setInterval(async () => {
    try {
      await db.one('SELECT 1');
      await setHealthStatus(health, true);
    } catch {
      await setHealthStatus(health, false);
    }
  }, 30_000);
}

async function setHealthStatus(health, serving) {
  const status = serving ? 'SERVING' : 'NOT_SERVING';
  health.setStatus('', status);
  health.setStatus(SERVICE_NAME, status);
}

main().catch(err => {
  logger.error('startup failed', { error: err.message });
  process.exit(1);
});