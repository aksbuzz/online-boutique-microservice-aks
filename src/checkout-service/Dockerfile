FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o checkout-service .

FROM alpine:latest
WORKDIR /app
COPY --from=build /app/checkout-service .
EXPOSE 5008
ENTRYPOINT ["./checkout-service"]
