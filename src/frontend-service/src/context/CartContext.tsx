import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { cartClient } from '../clients';
import { getUserId } from '../utils/user';

interface CartContextValue {
  itemCount: number;
  refreshCart: () => void;
}

const CartContext = createContext<CartContextValue>({
  itemCount: 0,
  refreshCart: () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [itemCount, setItemCount] = useState(0);

  const refreshCart = useCallback(async () => {
    try {
      const cart = await cartClient.getCart({ userId: getUserId() });
      const count = cart.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
      setItemCount(count);
    } catch {
      // keep current count on transient error
    }
  }, []);

  useEffect(() => {
    cartClient.getCart({ userId: getUserId() })
      .then(cart => {
        setItemCount(cart.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0);
      })
      .catch(() => {});
  }, []);

  return (
    <CartContext value={{ itemCount, refreshCart }}>
      {children}
    </CartContext>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCartContext = () => useContext(CartContext);