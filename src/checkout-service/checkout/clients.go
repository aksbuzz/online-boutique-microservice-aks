package checkout

import (
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
}

func NewClients(cartAddr, catalogAddr, currencyAddr, emailAddr, paymentAddr, shippingAddr string) *Clients {
	return &Clients{
		Cart:     cartpb.NewCartServiceClient(dial(cartAddr)),
		Catalog:  catalogpb.NewCatalogServiceClient(dial(catalogAddr)),
		Currency: currencypb.NewCurrencyServiceClient(dial(currencyAddr)),
		Email:    emailpb.NewEmailServiceClient(dial(emailAddr)),
		Payment:  paymentpb.NewPaymentServiceClient(dial(paymentAddr)),
		Shipping: shippingpb.NewShippingServiceClient(dial(shippingAddr)),
	}
}

func dial(addr string) *grpc.ClientConn {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		panic("grpc dial " + addr + ": " + err.Error())
	}
	return conn
}
