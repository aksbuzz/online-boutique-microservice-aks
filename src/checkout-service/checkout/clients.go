package checkout

import (
	"fmt"

	cartpb "github.com/aksbuzz/online-boutique/checkout-service/gen/cart"
	catalogpb "github.com/aksbuzz/online-boutique/checkout-service/gen/catalog"
	currencypb "github.com/aksbuzz/online-boutique/checkout-service/gen/currency"
	emailpb "github.com/aksbuzz/online-boutique/checkout-service/gen/email"
	paymentpb "github.com/aksbuzz/online-boutique/checkout-service/gen/payment"
	shippingpb "github.com/aksbuzz/online-boutique/checkout-service/gen/shipping"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Clients struct {
	Cart     cartpb.CartServiceClient
	Catalog  catalogpb.CatalogServiceClient
	Currency currencypb.CurrencyServiceClient
	Email    emailpb.EmailServiceClient
	Payment  paymentpb.PaymentServiceClient
	Shipping shippingpb.ShippingServiceClient
	conns    []*grpc.ClientConn
}

func (c *Clients) Close() {
	for _, conn := range c.conns {
		conn.Close()
	}
}

func NewClients(cartAddr, catalogAddr, currencyAddr, emailAddr, paymentAddr, shippingAddr string) (*Clients, error) {
	var err error
	clients := &Clients{}

	initClient := func(addr string, setter func(*grpc.ClientConn)) {
		if err != nil {
			return
		}
		var conn *grpc.ClientConn
		conn, err = dial(addr)
		if err == nil {
			setter(conn)
		}
		clients.conns = append(clients.conns, conn)
	}

	initClient(cartAddr, func(cc *grpc.ClientConn) { clients.Cart = cartpb.NewCartServiceClient(cc) })
	initClient(catalogAddr, func(cc *grpc.ClientConn) { clients.Catalog = catalogpb.NewCatalogServiceClient(cc) })
	initClient(currencyAddr, func(cc *grpc.ClientConn) { clients.Currency = currencypb.NewCurrencyServiceClient(cc) })
	initClient(emailAddr, func(cc *grpc.ClientConn) { clients.Email = emailpb.NewEmailServiceClient(cc) })
	initClient(paymentAddr, func(cc *grpc.ClientConn) { clients.Payment = paymentpb.NewPaymentServiceClient(cc) })
	initClient(shippingAddr, func(cc *grpc.ClientConn) { clients.Shipping = shippingpb.NewShippingServiceClient(cc) })

	if err != nil {
		return nil, err
	}

	return clients, nil
}

func dial(addr string) (*grpc.ClientConn, error) {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to create gRPC client for %s: %w", addr, err)
	}
	return conn, nil
}
