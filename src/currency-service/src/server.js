import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'url';
import path from 'path';
import { HealthImplementation } from 'grpc-health-check';
import { getLogger } from './logger.js';
import { getRates, warmCache } from './cache.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const logger = getLogger('currency-service');

const PROTO_PATH = path.join(__dirname, './proto/Currency.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const { boutiqueshop } = grpc.loadPackageDefinition(packageDef);

const SERVICE_NAME = 'boutiqueshop.CurrencyService';

// Money proto: { currencyCode, units (int64 as string), nanos (int32) }
function moneyToDecimal(money) {
  return Number(money.units) + money.nanos / 1_000_000_000;
}

function decimalToMoney(amount, currencyCode) {
  const units = Math.trunc(amount);
  const nanos = Math.round((amount - units) * 1_000_000_000);
  return { currencyCode, units: String(units), nanos };
}

async function getSupportedCurrencies(_call, callback) {
  try {
    const rates = await getRates();
    callback(null, { currencyCodes: Object.keys(rates).map(c => c.toUpperCase()) });
  } catch (err) {
    logger.error('getSupportedCurrencies failed', { error: err.message });
    callback({ code: grpc.status.UNAVAILABLE, message: err.message });
  }
}

async function convert(call, callback) {
  try {
    const { from, toCode } = call.request;
    const rates = await getRates();

    const fromCode = from.currencyCode.toLowerCase();
    const toCodeLower = toCode.toLowerCase();

    if (!rates[fromCode]) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: `unsupported currency: ${from.currencyCode}`,
      });
    }
    if (!rates[toCodeLower]) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: `unsupported currency: ${toCode}`,
      });
    }

    const amount = moneyToDecimal(from);
    const result = amount * (rates[toCodeLower] / rates[fromCode]);

    callback(null, decimalToMoney(result, toCode.toUpperCase()));
  } catch (err) {
    logger.error('convert failed', { error: err.message });
    callback({ code: grpc.status.UNAVAILABLE, message: err.message });
  }
}

async function main() {
  const health = new HealthImplementation({ '': 'NOT_SERVING', [SERVICE_NAME]: 'NOT_SERVING' });

  // Warm cache — non-fatal if it fails
  try {
    await warmCache();
    health.setStatus('', 'SERVING');
    health.setStatus(SERVICE_NAME, 'SERVING');
    logger.info('cache warmed — service ready');
  } catch (err) {
    logger.warn('startup fetch failed — starting degraded', { error: err.message });
  }

  const server = new grpc.Server();
  server.addService(boutiqueshop.CurrencyService.service, {
    getSupportedCurrencies,
    convert,
  });
  health.addToServer(server);

  server.bindAsync('0.0.0.0:5005', grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      logger.error('failed to bind', { error: err.message });
      process.exit(1);
    }
    logger.info(`currency-service listening on port ${port}`);
  });
}

main().catch(err => {
  logger.error('startup failed', { error: err.message });
  process.exit(1);
});
