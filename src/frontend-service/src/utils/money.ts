import type { Money } from '../gen/Catalog_pb';

export function formatMoney(money: Money): string {
  const value = Number(money.units) + money.nanos / 1_000_000_000;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: money.currencyCode || 'USD',
  }).format(value);
}
