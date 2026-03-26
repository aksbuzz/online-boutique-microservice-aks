import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product, Money } from '../gen/Catalog_pb';
import { currencyClient } from '../clients';
import { formatMoney } from '../utils/money';

interface ProductCardProps {
  product: Product;
  selectedCurrency: string;
  /** offset class for staggered layout on home page (optional) */
  offsetClass?: string;
}

export function ProductCard({ product, selectedCurrency, offsetClass = '' }: ProductCardProps) {
  const [displayPrice, setDisplayPrice] = useState<Money | null>(product.priceUsd ?? null);

  useEffect(() => {
    if (!product.priceUsd) return;
    const price = product.priceUsd;
    const promise = selectedCurrency === price.currencyCode
      ? Promise.resolve(price)
      : currencyClient.convert({ from: price, toCode: selectedCurrency });
    promise
      .then(setDisplayPrice)
      .catch(() => setDisplayPrice(price));
  }, [product.priceUsd, selectedCurrency]);

  return (
    <Link to={`/product/${product.id}`} className={`group cursor-pointer pt-12 ${offsetClass}`}>
      <div className="aspect-4/5 bg-surface-container-low overflow-hidden rounded-DEFAULT mb-6">
        {product.picture ? (
          <img
            alt={product.name}
            src={product.picture}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-surface-container-high" />
        )}
      </div>
      <div className="space-y-1">
        <h3 className="font-body text-lg font-medium text-primary tracking-tight">
          {product.name}
        </h3>
        <p className="text-on-surface-variant text-sm font-light mb-2 uppercase tracking-widest">
          {product.categories.join(', ')}
        </p>
        <p className="font-headline text-xl text-primary">
          {displayPrice ? formatMoney(displayPrice) : '—'}
        </p>
      </div>
    </Link>
  );
}
