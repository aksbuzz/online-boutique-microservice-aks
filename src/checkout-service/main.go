package main

import (
	"log/slog"
	"net"
	"os"

	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"

	"github.com/aksbuzz/online-boutique/checkout-service/checkout"
	checkoutpb "github.com/aksbuzz/online-boutique/checkout-service/gen/checkout"
)

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	clients, err := checkout.NewClients(
		getenv("CART_SERVICE_ADDR", "cart-service:5001"),
		getenv("CATALOG_SERVICE_ADDR", "catalog-service:5002"),
		getenv("CURRENCY_SERVICE_ADDR", "currency-service:5005"),
		getenv("EMAIL_SERVICE_ADDR", "email-service:5003"),
		getenv("PAYMENT_SERVICE_ADDR", "payment-service:5006"),
		getenv("SHIPPING_SERVICE_ADDR", "shipping-service:5004"),
	)
	defer clients.Close()
	if err != nil {
		log.Error("failed to initialize downstream clients", "err", err)
		os.Exit(1)
	}

	port := getenv("PORT", "5008")
	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Error("listen failed", "err", err)
		os.Exit(1)
	}

	srv := grpc.NewServer()

	checkoutpb.RegisterCheckoutServiceServer(srv, checkout.NewService(clients, log))

	healthSrv := health.NewServer()
	grpc_health_v1.RegisterHealthServer(srv, healthSrv)
	healthSrv.SetServingStatus("", grpc_health_v1.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus("boutiqueshop.CheckoutService", grpc_health_v1.HealthCheckResponse_SERVING)

	reflection.Register(srv) // enables grpcurl and grpc_cli introspection

	log.Info("checkout-service listening", "port", port)
	if err := srv.Serve(lis); err != nil {
		log.Error("serve failed", "err", err)
		os.Exit(1)
	}
}
