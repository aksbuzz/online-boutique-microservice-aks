import { useActionState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { checkoutClient } from '../clients';
import { getUserId } from '../utils/user';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string);

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      fontFamily: 'inherit',
      color: '#1a1a1a',
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#dc2626' },
  },
};

function CheckoutForm() {
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();
  const selectedCurrency = localStorage.getItem('boutique-currency') ?? 'USD';

  const [error, submitAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      if (!stripe || !elements) return 'Stripe not loaded. Please refresh.';

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return 'Card element not found.';

      // Tokenize card — card data goes directly to Stripe, never to your server
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: { email: formData.get('email') as string },
      });

      if (stripeError) {
        return stripeError.message ?? 'Card error. Please check your details.';
      }

      try {
        const res = await checkoutClient.placeOrder({
          userId: getUserId(),
          userEmail: formData.get('email') as string,
          userCurrency: selectedCurrency,
          address: {
            streetAddress: formData.get('street') as string,
            city: formData.get('city') as string,
            state: formData.get('state') as string,
            country: formData.get('country') as string,
            zipCode: parseInt(formData.get('zip') as string, 10) || 0,
          },
          paymentMethodId: paymentMethod.id,
        });
        navigate('/success', { state: { order: res.order } });
        return null;
      } catch (e: unknown) {
        return e instanceof Error ? e.message : 'Order failed. Please check your details.';
      }
    },
    null,
  );

  return (
    <form action={submitAction} className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-16">
      <div className="space-y-16">
        {/* Contact */}
        <section>
          <div className="flex items-center space-x-4 mb-8">
            <span className="font-headline font-bold text-xl text-primary">01</span>
            <h2 className="font-headline text-xl font-bold uppercase">Contact Information</h2>
          </div>
          <input
            name="email"
            className="w-full h-14 px-6 bg-surface-container-highest border-none rounded focus:outline-none font-body"
            placeholder="your@email.com"
            type="email"
            required
          />
        </section>

        {/* Shipping */}
        <section>
          <div className="flex items-center space-x-4 mb-8">
            <span className="font-headline font-bold text-xl text-primary">02</span>
            <h2 className="font-headline text-xl font-bold uppercase">Shipping Address</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <input
              name="street"
              className="md:col-span-2 w-full h-14 px-6 bg-surface-container-highest border-none rounded focus:outline-none font-body"
              placeholder="Street Address"
              required
            />
            <input
              name="city"
              className="w-full h-14 px-6 bg-surface-container-highest border-none rounded focus:outline-none font-body"
              placeholder="City"
              required
            />
            <input
              name="state"
              className="w-full h-14 px-6 bg-surface-container-highest border-none rounded focus:outline-none font-body"
              placeholder="State"
              required
            />
            <input
              name="country"
              className="w-full h-14 px-6 bg-surface-container-highest border-none rounded focus:outline-none font-body"
              placeholder="Country"
              required
            />
            <input
              name="zip"
              className="w-full h-14 px-6 bg-surface-container-highest border-none rounded focus:outline-none font-body"
              placeholder="Zip Code"
              required
            />
          </div>
        </section>

        {/* Payment */}
        <section>
          <div className="flex items-center space-x-4 mb-8">
            <span className="font-headline font-bold text-xl text-primary">03</span>
            <h2 className="font-headline text-xl font-bold uppercase">Payment Details</h2>
          </div>
          <div className="bg-surface-container-low p-8 rounded-lg">
            <CardElement options={CARD_ELEMENT_OPTIONS} className="py-4" />
          </div>
        </section>
      </div>

      {/* Sidebar */}
      <aside>
        <div className="sticky top-32 bg-surface-container-lowest p-8 rounded-lg editorial-shadow border border-outline-variant/10">
          <h3 className="font-headline text-lg font-bold uppercase mb-8">Selected Currency</h3>
          <p className="font-body text-on-surface-variant text-sm mb-8">
            Order will be placed in <strong>{selectedCurrency}</strong>.
          </p>
          {error && (
            <div className="mb-6 p-4 bg-error-container text-on-error-container rounded font-body text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isPending || !stripe}
            className="w-full mt-4 h-16 bg-on-tertiary-container hover:opacity-90 text-white font-headline font-bold uppercase tracking-widest text-sm rounded transition-all disabled:opacity-60"
          >
            {isPending ? 'Placing Order…' : 'Place Order'}
          </button>
          <p className="text-[10px] text-on-surface-variant text-center mt-4 tracking-wider">
            Test card: 4242 4242 4242 4242
          </p>
        </div>
      </aside>
    </form>
  );
}

export function CheckoutPage() {
  return (
    <main className="pt-32 pb-24 px-8 md:px-16 max-w-480 mx-auto min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-16">
          <h1 className="font-headline text-5xl font-extrabold tracking-tighter mb-4 text-primary">
            Secure Checkout
          </h1>
        </header>
        <Elements stripe={stripePromise}>
          <CheckoutForm />
        </Elements>
      </div>
    </main>
  );
}
