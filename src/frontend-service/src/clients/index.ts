import { createClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { CatalogService } from '../gen/Catalog_pb';
import { CartService } from '../gen/Cart_pb';
import { CurrencyService } from '../gen/Currency_pb';
import { RecommendationService } from '../gen/Recommendation_pb';
import { CheckoutService } from '../gen/Checkout_pb';

const transport = createGrpcWebTransport({
  baseUrl: '/grpc',
});

export const catalogClient = createClient(CatalogService, transport);
export const cartClient = createClient(CartService, transport);
export const currencyClient = createClient(CurrencyService, transport);
export const recommendationClient = createClient(RecommendationService, transport);
export const checkoutClient = createClient(CheckoutService, transport);
