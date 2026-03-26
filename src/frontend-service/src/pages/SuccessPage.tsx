import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { OrderResult, OrderItem } from '../gen/Checkout_pb';
import type { Product } from '../gen/Catalog_pb';
import { catalogClient } from '../clients';
import { formatMoney } from '../utils/money';

interface EnrichedOrderItem {
  orderItem: OrderItem;
  product: Product | null;
}

export function SuccessPage() {
  const location = useLocation();
  const order = (location.state as { order?: OrderResult } | null)?.order;

  const [enrichedItems, setEnrichedItems] = useState<EnrichedOrderItem[]>([]);

  useEffect(() => {
    if (!order) return;
    Promise.all(
      order.items.map(async oi => {
        try {
          const product = await catalogClient.getProduct({ id: oi.item?.productId ?? '' });
          return { orderItem: oi, product };
        } catch {
          return { orderItem: oi, product: null };
        }
      }),
    ).then(setEnrichedItems);
  }, [order]);

  if (!order) {
    return (
      <div className="pt-48 text-center">
        <p className="text-on-surface-variant font-body mb-6">No order found.</p>
        <Link to="/" className="font-headline font-bold uppercase text-sm underline">
          Back to Shop
        </Link>
      </div>
    );
  }

  return (
    <main className="pt-32 pb-24 px-6 md:px-12 lg:px-24 max-w-7xl mx-auto">
      {/* Header */}
      <section className="mb-20 grid grid-cols-1 md:grid-cols-12 gap-8 items-end">
        <div className="md:col-span-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-12 h-px bg-on-tertiary-container" />
            <span className="text-on-tertiary-container font-headline font-bold text-sm uppercase tracking-widest">
              Order Confirmed
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-primary leading-tight mb-6">
            THANK YOU FOR
            <br />
            YOUR CURATION.
          </h1>
        </div>
        <div className="md:col-span-4 flex flex-col items-end gap-4">
          <div className="bg-surface-container-highest p-8 rounded-lg w-full max-w-xs text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant mb-1">
              Order Reference
            </p>
            <p className="text-xl font-headline font-extrabold text-primary truncate">
              {order.orderId}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* Shipping info */}
        <div className="lg:col-span-4 space-y-12">
          <div className="bg-surface-container-low p-10 rounded-lg">
            <h3 className="font-headline font-bold text-xl mb-8 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">local_shipping</span>{' '}
              Logistics
            </h3>
            <div className="space-y-8">
              <div>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">
                  Tracking ID
                </p>
                <p className="text-primary font-medium">{order.shippingTrackingId}</p>
              </div>
              {order.shippingCost && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">
                    Shipping Cost
                  </p>
                  <p className="text-primary font-medium">{formatMoney(order.shippingCost)}</p>
                </div>
              )}
              {order.shippingAddress && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">
                    Ship To
                  </p>
                  <p className="text-primary font-medium text-sm">
                    {order.shippingAddress.streetAddress}, {order.shippingAddress.city},{' '}
                    {order.shippingAddress.country}
                  </p>
                </div>
              )}
            </div>
          </div>
          <Link
            to="/"
            className="group inline-flex items-center gap-4 py-4 px-2 border-b-2 border-primary hover:gap-6 transition-all"
          >
            <span className="font-headline font-bold uppercase text-sm tracking-tighter">
              Continue Shopping
            </span>
            <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </Link>
        </div>

        {/* Order items */}
        <div className="lg:col-span-8">
          <div className="bg-surface-container-lowest p-8 rounded-xl">
            <h3 className="font-headline font-bold text-2xl mb-12">Itemized Summary</h3>
            <div className="space-y-10 mb-16">
              {enrichedItems.map(({ orderItem, product }, i) => (
                <div key={i} className="flex flex-col md:flex-row gap-8 items-start">
                  {product?.picture && (
                    <div className="w-full md:w-32 aspect-4/5 bg-surface-container overflow-hidden rounded">
                      <img
                        className="w-full h-full object-cover"
                        src={product.picture}
                        alt={product.name}
                      />
                    </div>
                  )}
                  <div className="flex-1 flex flex-col md:flex-row justify-between">
                    <div className="space-y-2">
                      <h4 className="font-headline font-bold text-lg text-primary">
                        {product?.name ?? orderItem.item?.productId}
                      </h4>
                      <p className="text-sm text-on-surface-variant">
                        Qty: {orderItem.item?.quantity}
                      </p>
                    </div>
                    {orderItem.cost && (
                      <span className="font-headline font-bold text-xl text-primary">
                        {formatMoney(orderItem.cost)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
