import pgPromise from 'pg-promise';
import { DefaultAzureCredential } from '@azure/identity';
import { getLogger } from './logger.js';

const logger = getLogger('catalog-service:db');

const isWorkloadIdentity = !!process.env.AZURE_CLIENT_ID;
let credential;

if (isWorkloadIdentity) {
  credential = new DefaultAzureCredential();
  logger.info('db auth: workload identity');
} else {
  logger.info('db auth: password');
}

const pgp = pgPromise();

const db = pgp({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'catalog',
  user: process.env.PG_USER || 'catalog_user',
  password: isWorkloadIdentity
    ? async () => {
        const token = await credential.getToken(
          'https://ossrdbms-aad.database.windows.net/.default',
        );
        return token.token;
      }
    : process.env.PG_PASSWORD,
  ssl: isWorkloadIdentity ? { rejectUnauthorized: false } : false,
});

export { db, pgp };