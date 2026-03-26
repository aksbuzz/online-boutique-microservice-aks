import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getLogger } from '../logger.js';

const logger = getLogger('catalog-service:cosmos');
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const ENDPOINT = process.env.COSMOS_ENDPOINT;
const DATABASE_ID = process.env.COSMOS_DATABASE || 'catalog';
const CONTAINER_ID = process.env.COSMOS_CONTAINER || 'products';

// Partition key path — each product is its own partition.
// getProduct uses a fast point read; listProducts/search use cross-partition queries.
const PARTITION_KEY = '/id';

function makeClient() {
  if (!ENDPOINT) throw new Error('COSMOS_ENDPOINT env var is required for cosmosdb backend');
  return new CosmosClient({
    endpoint: ENDPOINT,
    aadCredentials: new DefaultAzureCredential(),
  });
}

export class CosmosRepository {
  #client;
  #database;
  #container;

  constructor() {
    this.#client = makeClient();
    this.#database = this.#client.database(DATABASE_ID);
    this.#container = this.#database.container(CONTAINER_ID);
  }

  async listProducts() {
    const { resources } = await this.#container.items
      .query('SELECT * FROM c ORDER BY c.name')
      .fetchAll();
    return resources;
  }

  async getProduct(id) {
    const { resource } = await this.#container.item(id, id).read();
    return resource ?? null; // undefined → null when not found
  }

  async searchProducts(query) {
    const { resources } = await this.#container.items
      .query({
        query: `SELECT * FROM c
                WHERE CONTAINS(UPPER(c.name), UPPER(@q))
                   OR CONTAINS(UPPER(c.description), UPPER(@q))
                ORDER BY c.name`,
        parameters: [{ name: '@q', value: query }],
      })
      .fetchAll();
    return resources;
  }

  async seed() {
    // Ensure database and container exist before upserting.
    const { database } = await this.#client.databases.createIfNotExists({ id: DATABASE_ID });
    const { container } = await database.containers.createIfNotExists({
      id: CONTAINER_ID,
      partitionKey: { paths: [PARTITION_KEY] },
    });

    const products = JSON.parse(
      readFileSync(path.join(__dirname, '../data/products.json'), 'utf8'),
    );

    for (const p of products) {
      await container.items.upsert(p);
    }

    logger.info('cosmos seeded products', { count: products.length });
  }

  async ping() {
    await this.#database.read();
  }
}
