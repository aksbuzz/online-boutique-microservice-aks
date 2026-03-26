import { PostgresRepository } from './postgres.js';
import { CosmosRepository } from './cosmos.js';
import { getLogger } from '../logger.js';

const logger = getLogger('catalog-service:repository');

export function createRepository() {
  const backend = process.env.CATALOG_BACKEND || 'postgres';
  if (backend === 'cosmosdb') {
    logger.info('catalog backend: cosmosdb');
    return new CosmosRepository();
  }
  logger.info('catalog backend: postgres');
  return new PostgresRepository();
}
