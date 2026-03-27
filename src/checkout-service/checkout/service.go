package checkout

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	cartpb "github.com/aksbuzz/online-boutique/checkout-service/gen/cart"
	catalogpb "github.com/aksbuzz/online-boutique/checkout-service/gen/catalog"
	checkoutpb "github.com/aksbuzz/online-boutique/checkout-service/gen/checkout"
	currencypb "github.com/aksbuzz/online-boutique/checkout-service/gen/currency"
	emailpb "github.com/aksbuzz/online-boutique/checkout-service/gen/email"
	paymentpb "github.com/aksbuzz/online-boutique/checkout-service/gen/payment"
	shippingpb "github.com/aksbuzz/online-boutique/checkout-service/gen/shipping"
)

// Service implements the CheckoutService gRPC server.
type Service struct {
	checkoutpb.UnimplementedCheckoutServiceServer
	clients *Clients
	log     *slog.Logger
}

// NewService constructs a Service with the given downstream clients and logger.
func NewService(clients *Clients, log *slog.Logger) *Service {
	return &Service{clients: clients, log: log}
}

func (s *Service) PlaceOrder(ctx context.Context, req *checkoutpb.PlaceOrderRequest) (*checkoutpb.PlaceOrderResponse, error) {
	// Generate order ID first — flows through all downstream calls and logs.
	orderID := uuid.New().String()
	log := s.log.With("order_id", orderID, "user_id", req.UserId)
	log.Info("placing order")

	// ── Step 1: Get cart ────────────────────────────────────────────────────
	cart, err := s.clients.Cart.GetCart(ctx, &cartpb.GetCartRequest{UserId: req.UserId})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get cart: %v", err)
	}
	if len(cart.Items) == 0 {
		return nil, status.Error(codes.InvalidArgument, "cart is empty")
	}

	// ── Step 2: Get products + shipping quote in parallel ───────────────────
	products := make([]*catalogpb.Product, len(cart.Items))
	var shippingQuoteUSD *catalogpb.Money

	g, gctx := errgroup.WithContext(ctx)

	for i, item := range cart.Items {
		i, item := i, item // capture for goroutine
		g.Go(func() error {
			p, err := s.clients.Catalog.GetProduct(gctx, &catalogpb.GetProductRequest{Id: item.ProductId})
			if err != nil {
				return fmt.Errorf("get product %s: %w", item.ProductId, err)
			}
			products[i] = p
			return nil
		})
	}

	g.Go(func() error {
		q, err := s.clients.Shipping.GetQuote(gctx, &shippingpb.GetQuoteRequest{
			Address: req.Address,
			Items:   cart.Items,
		})
		if err != nil {
			return fmt.Errorf("shipping quote: %w", err)
		}
		shippingQuoteUSD = q.CostUsd
		return nil
	})

	if err := g.Wait(); err != nil {
		return nil, status.Errorf(codes.Internal, "%v", err)
	}

	// ── Step 3: Convert all prices to user currency in parallel ─────────────
	converted := make([]*catalogpb.Money, len(products))
	var shippingConverted *catalogpb.Money

	g, gctx = errgroup.WithContext(ctx)

	for i, p := range products {
		i, p := i, p
		g.Go(func() error {
			m, err := s.clients.Currency.Convert(gctx, &currencypb.CurrencyConversionRequest{
				From:   &catalogpb.Money{CurrencyCode: p.PriceUsd.CurrencyCode, Units: p.PriceUsd.Units, Nanos: p.PriceUsd.Nanos},
				ToCode: req.UserCurrency,
			})
			if err != nil {
				return fmt.Errorf("convert price for product %s: %w", p.Id, err)
			}
			converted[i] = m
			return nil
		})
	}

	g.Go(func() error {
		m, err := s.clients.Currency.Convert(gctx, &currencypb.CurrencyConversionRequest{
			From:   &catalogpb.Money{CurrencyCode: shippingQuoteUSD.CurrencyCode, Units: shippingQuoteUSD.Units, Nanos: shippingQuoteUSD.Nanos},
			ToCode: req.UserCurrency,
		})
		if err != nil {
			return fmt.Errorf("convert shipping cost: %w", err)
		}
		shippingConverted = m
		return nil
	})

	if err := g.Wait(); err != nil {
		return nil, status.Errorf(codes.Internal, "%v", err)
	}

	// ── Step 4: Sum total ───────────────────────────────────────────────────
	total := &catalogpb.Money{CurrencyCode: req.UserCurrency}
	for i, item := range cart.Items {
		if converted[i] == nil {
			return nil, fmt.Errorf("failed to get converted price for product %q", &item.ProductId)
		}
		total = addMoney(total, multiplyMoney(converted[i], item.Quantity))
	}
	if shippingConverted == nil {
		return nil, fmt.Errorf("failed to calculate shipping cost")
	}
	total = addMoney(total, shippingConverted)

	// ── Step 5: Charge ──────────────────────────────────────────────────────
	// order_id is the Stripe idempotency key — retrying PlaceOrder with the
	// same order_id returns the original charge, no double charge.
	chargeResp, err := s.clients.Payment.Charge(ctx, buildChargeRequest(
		req.PaymentMethodId,
		total,
		orderID,
	))
	if err != nil {
		// Pass payment-service status codes through directly (INVALID_ARGUMENT for
		// card declines, RESOURCE_EXHAUSTED for rate limit, etc.)
		return nil, err
	}

	// ── Step 6: Ship order ──────────────────────────────────────────────────
	shipResp, err := s.clients.Shipping.ShipOrder(ctx, &shippingpb.ShipOrderRequest{
		Address: req.Address,
		Items:   cart.Items,
	})
	trackingID := ""
	if err != nil {
		// Payment already went through — log for ops and continue.
		log.Error("ship order failed after successful payment",
			"transaction_id", chargeResp.TransactionId, "err", err)
	} else {
		trackingID = shipResp.TrackingId
	}

	// Build order items for response and email.
	orderItems := make([]*checkoutpb.OrderItem, len(cart.Items))
	for i, item := range cart.Items {
		orderItems[i] = &checkoutpb.OrderItem{
			Item: item,
			Cost: converted[i],
		}
	}

	result := &checkoutpb.OrderResult{
		OrderId:            orderID,
		ShippingTrackingId: trackingID,
		ShippingCost:       shippingConverted,
		ShippingAddress:    req.Address,
		Items:              orderItems,
	}

	// ── Step 7: Send confirmation email (fire-and-forget) ───────────────────
	go func(originalCtx context.Context, orderDetails *checkoutpb.OrderResult) {
		emailCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		_, emailErr := s.clients.Email.SendOrderConfirmation(emailCtx, &emailpb.SendOrderConfirmationRequest{
			Email: req.UserEmail,
			Order: result,
		})

		if emailErr != nil {
			log.Warn("send confirmation email failed", "err", emailErr)
		}
	}(ctx, result)

	// ── Step 8: Empty cart ────────────────────────────────
	cartCtx, cancelCart := context.WithTimeout(ctx, 5*time.Second)
	defer cancelCart()

	_, cartErr := s.clients.Cart.EmptyCart(cartCtx, &cartpb.EmptyCartRequest{UserId: req.UserId})
	if cartErr != nil {
		log.Error("failed to empty cart after successful payment",
			"err", cartErr,
			"user_id", req.UserId,
			"transaction_id", chargeResp.TransactionId)
	}

	log.Info("order placed", "transaction_id", chargeResp.TransactionId, "tracking_id", trackingID)
	return &checkoutpb.PlaceOrderResponse{Order: result}, nil
}

// ── Money helpers ────────────────────────────────────────────────────────────

// addMoney adds two Money values of the same currency.
func addMoney(a, b *catalogpb.Money) *catalogpb.Money {
	nanos := int64(a.Nanos) + int64(b.Nanos)
	return &catalogpb.Money{
		CurrencyCode: a.CurrencyCode,
		Units:        a.Units + b.Units + nanos/1_000_000_000,
		Nanos:        int32(nanos % 1_000_000_000),
	}
}

// multiplyMoney multiplies a Money value by a scalar quantity.
func multiplyMoney(m *catalogpb.Money, n int32) *catalogpb.Money {
	if m == nil {
		return &catalogpb.Money{}
	}

	totalNanos := int64(m.Nanos) * int64(n)
	return &catalogpb.Money{
		CurrencyCode: m.CurrencyCode,
		Units:        m.Units*int64(n) + totalNanos/1_000_000_000,
		Nanos:        int32(totalNanos % 1_000_000_000),
	}
}

// buildChargeRequest constructs the payment ChargeRequest from the order total.
// paymentMethodId is a Stripe pm_xxx token created by the frontend via Stripe.js.
func buildChargeRequest(paymentMethodId string, total *catalogpb.Money, orderID string) *paymentpb.ChargeRequest {
	return &paymentpb.ChargeRequest{
		PaymentMethodId: paymentMethodId,
		Amount: &paymentpb.Money{
			CurrencyCode: total.CurrencyCode,
			Units:        total.Units,
			Nanos:        total.Nanos,
		},
		OrderId: orderID,
	}
}
