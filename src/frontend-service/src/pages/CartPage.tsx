import { use, useState, useTransition, useOptimistic, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { create } from '@bufbuild/protobuf';
import type { CartItem } from '../gen/Cart_pb';
import type { Product, Money } from '../gen/Catalog_pb';
import { MoneySchema } from '../gen/Catalog_pb';
import { cartClient, catalogClient, currencyClient } from '../clients';
import { getUserId } from '../utils/user';
import { useCartContext } from '../context/CartContext';
import { formatMoney } from '../utils/money';
import { ErrorBoundary } from '../components/ErrorBoundary';

interface EnrichedItem {
  cartItem: CartItem;
  product: Product;
  convertedPrice: Money;
}

async function fetchCartEnriched(selectedCurrency: string): Promise<EnrichedItem[]> {
  const cart = await cartClient.getCart({ userId: getUserId() });
  return Promise.all(
    cart.items.map(async ci => {
      const product = await catalogClient.getProduct({ id: ci.productId });
      const convertedPrice =
        product.priceUsd && selectedCurrency !== product.priceUsd.currencyCode
          ? await currencyClient.convert({ from: product.priceUsd, toCode: selectedCurrency })
          : (product.priceUsd ?? create(MoneySchema, { units: 0n, nanos: 0, currencyCode: selectedCurrency }));
      return { cartItem: ci, product, convertedPrice };
    }),
  );
}

function CartContent({
  cartPromise,
  onReload,
  selectedCurrency,
}: {
  cartPromise: Promise<EnrichedItem[]>;
  onReload: () => void;
  selectedCurrency: string;
}) {
  const { refreshCart } = useCartContext();
  const items = use(cartPromise);
  const [optimisticItems, removeOptimistic] = useOptimistic(
    items,
    (current, productId: string) => current.filter(i => i.cartItem.productId !== productId),
  );
  const [, startTransition] = useTransition();

  const handleRemove = (productId: string) => {
    startTransition(async () => {
      removeOptimistic(productId);
      const remaining = items.filter(i => i.cartItem.productId !== productId);
      await cartClient.emptyCart({ userId: getUserId() });
      await Promise.all(
        remaining.map(i =>
          cartClient.addItem({
            userId: getUserId(),
            item: { productId: i.cartItem.productId, quantity: i.cartItem.quantity },
          }),
        ),
      );
      refreshCart();
      onReload();
    });
  };

  const subtotal = optimisticItems.reduce(
    (sum, i) =>
      sum + (Number(i.convertedPrice.units) + i.convertedPrice.nanos / 1e9) * i.cartItem.quantity,
    0,
  );

  if (optimisticItems.length === 0) {
    return (
      <div className="text-center py-24">
        <p className="text-on-surface-variant font-body mb-8">Your cart is empty.</p>
        <Link
          to="/"
          className="font-headline font-bold uppercase text-sm tracking-widest underline"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
      {/* Items */}
      <div className="lg:col-span-8 space-y-12">
        {optimisticItems.map(({ cartItem, product, convertedPrice }) => (
          <div
            key={cartItem.productId}
            className="flex flex-col md:flex-row gap-8 items-start pb-12 border-b border-outline-variant/20"
          >
            <div className="w-full md:w-48 aspect-4/5 bg-surface-container-low overflow-hidden rounded-lg">
              {product.picture && (
                <img
                  className="w-full h-full object-cover"
                  src={product.picture}
                  alt={product.name}
                />
              )}
            </div>
            <div className="grow flex flex-col justify-between self-stretch">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-headline text-2xl font-bold tracking-tight text-primary mb-1">
                    {product.name}
                  </h3>
                  <p className="font-body text-on-surface-variant text-sm uppercase tracking-widest">
                    {product.categories.join(' / ')}
                  </p>
                </div>
                <span className="font-headline text-xl text-primary">
                  {formatMoney(convertedPrice)}
                </span>
              </div>
              <div className="flex justify-between items-end mt-8">
                <div className="flex items-center space-x-4">
                  <span className="font-label text-xs uppercase tracking-tighter text-on-surface-variant">
                    Qty
                  </span>
                  <span className="font-label font-bold text-sm">
                    {String(cartItem.quantity).padStart(2, '0')}
                  </span>
                </div>
                <button
                  onClick={() => handleRemove(cartItem.productId)}
                  className="flex items-center text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined mr-2 text-lg">delete</span> Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="lg:col-span-4">
        <div className="sticky top-32 p-10 bg-surface-container-lowest editorial-shadow rounded-lg">
          <h2 className="font-headline text-2xl font-bold tracking-tight text-primary mb-8">
            Order Summary
          </h2>
          <div className="space-y-4 mb-8">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant font-body">Subtotal</span>
              <span className="text-primary font-headline font-bold">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: selectedCurrency,
                }).format(subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant font-body">Shipping</span>
              <span className="text-primary font-body uppercase tracking-widest text-[10px]">
                Calculated at next step
              </span>
            </div>
          </div>
          <div className="pt-6 border-t border-outline-variant/20 mb-10">
            <div className="flex justify-between items-baseline">
              <span className="font-headline text-lg font-bold">Estimated Total</span>
              <span className="font-headline text-3xl font-black text-primary">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: selectedCurrency,
                }).format(subtotal)}
              </span>
            </div>
          </div>
          <Link
            to="/checkout"
            className="w-full py-5 bg-on-tertiary-container text-white font-headline font-bold text-sm uppercase tracking-[0.2em] rounded hover:opacity-90 transition-all flex items-center justify-center group"
          >
            Proceed to Checkout
            <span className="material-symbols-outlined ml-2 group-hover:translate-x-1 transition-transform">
              arrow_right_alt
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CartPage() {
  const selectedCurrency = localStorage.getItem('boutique-currency') ?? 'USD';
  const [cartPromise, setCartPromise] = useState(() => fetchCartEnriched(selectedCurrency));

  const reload = () => setCartPromise(fetchCartEnriched(selectedCurrency));

  return (
    <main className="pt-32 pb-24 min-h-screen px-8 md:px-16 max-w-480 mx-auto">
      <header className="mb-16">
        <h1 className="font-headline text-5xl md:text-7xl font-extrabold tracking-tighter text-primary mb-4">
          Your Selection
        </h1>
      </header>

      <ErrorBoundary
        fallback={(err, reset) => (
          <div className="py-8">
            <p className="text-error font-body mb-4">{err.message}</p>
            <button
              onClick={() => {
                reload();
                reset();
              }}
              className="text-sm underline font-body"
            >
              Retry
            </button>
          </div>
        )}
      >
        <Suspense fallback={<p className="text-on-surface-variant font-body">Loading…</p>}>
          <CartContent
            cartPromise={cartPromise}
            onReload={reload}
            selectedCurrency={selectedCurrency}
          />
        </Suspense>
      </ErrorBoundary>
    </main>
  );
}
