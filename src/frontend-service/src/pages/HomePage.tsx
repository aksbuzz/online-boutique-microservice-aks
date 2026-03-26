import { use, useMemo, useState, useDeferredValue, Suspense } from 'react';
import type { Product } from '../gen/Catalog_pb';
import { catalogClient, currencyClient } from '../clients';
import { ProductCard } from '../components/ProductCard';
import { ErrorBoundary } from '../components/ErrorBoundary';

const OFFSET_CLASSES = ['', 'md:pt-0', 'md:pt-24', '', '', ''];

// Stable module-level promise — fetched once on app load, never recreated
const currenciesPromise = currencyClient
  .getSupportedCurrencies({})
  .then(r => r.currencyCodes);

function CurrencySelect({
  selectedCurrency,
  onChange,
}: {
  selectedCurrency: string;
  onChange: (code: string) => void;
}) {
  const currencies = use(currenciesPromise);
  return (
    <select
      value={selectedCurrency}
      onChange={e => onChange(e.target.value)}
      className="h-10 px-3 bg-surface-container-highest border-none rounded text-sm font-body focus:outline-none"
    >
      {currencies.map(c => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function ProductGrid({
  productsPromise,
  selectedCurrency,
}: {
  productsPromise: Promise<Product[]>;
  selectedCurrency: string;
}) {
  const products = use(productsPromise);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-y-16 gap-x-12">
      {products.map((p, i) => (
        <ProductCard
          key={p.id}
          product={p}
          selectedCurrency={selectedCurrency}
          offsetClass={OFFSET_CLASSES[i % OFFSET_CLASSES.length]}
        />
      ))}
    </div>
  );
}

export function HomePage() {
  const [selectedCurrency, setSelectedCurrency] = useState(
    localStorage.getItem('boutique-currency') ?? 'USD',
  );
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const handleCurrencyChange = (code: string) => {
    setSelectedCurrency(code);
    localStorage.setItem('boutique-currency', code);
  };

  const productsPromise = useMemo(
    () =>
      deferredQuery.trim()
        ? catalogClient.searchProducts({ query: deferredQuery.trim() }).then(r => r.results)
        : catalogClient.listProducts({}).then(r => r.products),
    [deferredQuery],
  );

  return (
    <div className="pt-32 pb-24 px-8 md:px-16 max-w-480 mx-auto">
      <header className="mb-16 flex flex-col md:flex-row md:items-end gap-8">
        <div className="grow">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-primary mb-2">
            Essential Collection
          </h1>
          <p className="text-on-surface-variant font-body text-lg max-w-xl leading-relaxed">
            A curated selection of architectural silhouettes and timeless materials.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="h-10 w-24 bg-surface-container-highest rounded animate-pulse" />
              }
            >
              <CurrencySelect selectedCurrency={selectedCurrency} onChange={handleCurrencyChange} />
            </Suspense>
          </ErrorBoundary>
          <div className="flex items-center gap-2 h-10 px-4 bg-surface-container-highest rounded">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Search..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-body w-32"
            />
          </div>
        </div>
      </header>

      <ErrorBoundary
        key={deferredQuery}
        fallback={(err, reset) => (
          <div className="py-8">
            <p className="text-error font-body mb-4">{err.message}</p>
            <button onClick={reset} className="text-sm underline font-body">
              Retry
            </button>
          </div>
        )}
      >
        <Suspense fallback={<p className="text-on-surface-variant font-body">Loading…</p>}>
          <ProductGrid productsPromise={productsPromise} selectedCurrency={selectedCurrency} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
