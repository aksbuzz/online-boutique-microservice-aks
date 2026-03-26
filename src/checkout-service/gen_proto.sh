protoc \
  --go_out=. --go_opt=module=github.com/aksbuzz/online-boutique/checkout-service \
  --go-grpc_out=. --go-grpc_opt=module=github.com/aksbuzz/online-boutique/checkout-service \
  -I proto \
  proto/Checkout.proto proto/Cart.proto proto/Catalog.proto \
  proto/Currency.proto proto/Email.proto proto/Payment.proto \
  proto/Shipping.proto