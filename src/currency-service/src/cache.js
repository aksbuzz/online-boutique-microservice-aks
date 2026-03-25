import { fetchRates } from './rates.js';
import { getLogger } from './logger.js';

const logger = getLogger('currency-service:cache');

let fresh = null; // { rates, expiresAt }
let stale = null; // last known rates object
let refreshing = false;

function nextMidnightUTC() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const rates = await fetchRates();
    fresh = { rates, expiresAt: nextMidnightUTC() };
    stale = rates;
    logger.info('rates refreshed', { expiresAt: fresh.expiresAt.toISOString() });
  } catch (err) {
    logger.warn('rate refresh failed — using stale', { error: err.message });
  } finally {
    refreshing = false;
  }
}

export async function getRates() {
  if (fresh && Date.now() < fresh.expiresAt.getTime()) {
    return fresh.rates; // fresh hit
  }
  if (fresh && stale) {
    // expired — serve stale immediately, refresh in background
    refresh().catch(() => {});
    return stale;
  }
  if (stale) {
    // cold-start outage — serve stale, attempt refresh in background
    refresh().catch(() => {});
    return stale;
  }
  // cold start, nothing cached — must block
  await refresh();
  if (stale) return stale;
  throw new Error('no exchange rates available');
}

export async function warmCache() {
  await refresh();
}
