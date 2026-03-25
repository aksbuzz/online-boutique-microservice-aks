import CircuitBreaker from 'opossum';
import { getLogger } from './logger.js';

const logger = getLogger('currency-service:rates');

const PRIMARY_URL =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json';
const FALLBACK_URL = 'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json';

async function _fetch() {
  for (const url of [PRIMARY_URL, FALLBACK_URL]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.usd; // { eur: 0.92, gbp: 0.79, usd: 1.0, ... }
    } catch (err) {
      logger.warn(`fetch failed for ${url}`, { error: err.message });
    }
  }
  throw new Error('all rate endpoints failed');
}

const breaker = new CircuitBreaker(_fetch, {
  errorThresholdPercentage: 50,
  volumeThreshold: 5,
  resetTimeout: 60_000,
  timeout: 10_000,
});

breaker.on('open', () => logger.warn('circuit breaker opened — rate fetch failing'));
breaker.on('halfOpen', () => logger.info('circuit breaker half-open — probing'));
breaker.on('close', () => logger.info('circuit breaker closed — rate fetch recovered'));

export async function fetchRates() {
  return breaker.fire();
}
