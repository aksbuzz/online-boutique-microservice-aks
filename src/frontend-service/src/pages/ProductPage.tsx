import { useEffect, useState, useTransition } from 'react';
import { useParams } from 'react-router-dom';
import type { Product } from '../gen/Catalog_pb';
import { catalogClient, cartClient, recommendationClient } from '../clients';
import { formatMoney } from '../utils/money';
import { getUserId } from '../utils/user';
import { useCartContext } from '../context/CartContext';
import { ProductCard } from '../components/ProductCard';

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { refreshCart } = useCartContext();
  const selectedCurrency = localStorage.getItem('boutique-currency') ?? 'USD';

  const [product, setProduct] = useState<Product | null>(null);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [adding, setAdding] = useState(false);
  const [addedMsg, setAddedMsg] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    startTransition(async () => {
      try {
        const p = await catalogClient.getProduct({ id });
        setProduct(p);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Product not found');
      }
    });
  }, [id]);

  // Load recommendations after product is known
  useEffect(() => {
    if (!id) return;
    recommendationClient
      .listRecommendations({ userId: getUserId(), productIds: [id] })
      .then(async res => {
        const fetched = await Promise.all(
          res.productIds
            .filter(pid => pid !== id)
            .slice(0, 4)
            .map(pid => catalogClient.getProduct({ id: pid })),
        );
        setRecommendations(fetched);
      })
      .catch(() => {});
  }, [id]);

  const handleAddToCart = async () => {
    if (!id) return;
    setAdding(true);
    try {
      await cartClient.addItem({
        userId: getUserId(),
        item: { productId: id, quantity: 1 },
      });
      refreshCart();
      setAddedMsg('Added to cart');
      setTimeout(() => setAddedMsg(''), 2000);
    } catch (e: unknown) {
      setAddedMsg('Failed to add');
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  if (isPending) return <div className="pt-48 text-center text-on-surface-variant">Loading…</div>;
  if (error || !product)
    return <div className="pt-48 text-center text-error">{error ?? 'Not found'}</div>;

  return (
    <div className="pt-24 pb-32">
      <section className="max-w-480 mx-auto px-8 md:px-16 grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
        {/* Left: images */}
        <div className="lg:col-span-7">
          <div className="aspect-4/5 overflow-hidden rounded">
            {product.picture ? (
              <img
                alt={product.name}
                src={product.picture}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-surface-container-high" />
            )}
          </div>
        </div>

        {/* Right: info */}
        <div className="lg:col-span-5 lg:sticky lg:top-32 space-y-12 pl-0 lg:pl-12">
          <div>
            <nav className="flex space-x-2 text-[10px] uppercase tracking-widest text-on-surface-variant mb-6 font-label">
              <span>Collections</span>
              <span>/</span>
              <span className="text-primary font-bold">{product.name}</span>
            </nav>
            <h1 className="text-4xl font-extrabold font-headline tracking-tighter text-primary leading-tight">
              {product.name.toUpperCase()}
            </h1>
            {product.priceUsd && (
              <div className="mt-4 text-2xl font-headline text-primary">
                {formatMoney(product.priceUsd)}
              </div>
            )}
          </div>

          <p className="text-on-surface-variant leading-relaxed max-w-md">{product.description}</p>

          <div className="pt-4 flex flex-wrap gap-2">
            {product.categories.map(c => (
              <span
                key={c}
                className="px-3 py-1 bg-surface-container text-[10px] font-bold uppercase tracking-tighter text-on-surface-variant"
              >
                {c}
              </span>
            ))}
          </div>

          <div className="space-y-4">
            <button
              onClick={handleAddToCart}
              disabled={adding}
              className="w-full h-16 bg-on-tertiary-container text-white font-headline font-bold text-sm uppercase tracking-widest rounded-lg flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-60"
            >
              {adding ? 'Adding…' : addedMsg || 'Add to Cart'}
            </button>
          </div>
        </div>
      </section>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <section className="max-w-480 mx-auto px-8 md:px-16 mt-32">
          <h2 className="font-headline text-2xl font-bold tracking-tight text-primary mb-12">
            You May Also Like
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {recommendations.map(rec => (
              <ProductCard key={rec.id} product={rec} selectedCurrency={selectedCurrency} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
