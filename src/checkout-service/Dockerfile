FROM golang:1.25-alpine AS build
WORKDIR /app
RUN apk add --no-cache protobuf && \
    go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.11 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN export PATH=$PATH:$(go env GOPATH)/bin && sh gen_proto.sh
RUN CGO_ENABLED=0 GOOS=linux go build -o checkout-service .

FROM alpine:latest
WORKDIR /app
COPY --from=build /app/checkout-service .
EXPOSE 5008
ENTRYPOINT ["./checkout-service"]
