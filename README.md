# Online Boutique

Polyglot microservices demo - C#, Node.js, Python. Services communicate via gRPC.

## Services

| Service | Language | Port | Description |
|---|---|---|---|
| cart-service | C# (.NET 10) | 5001 | Stores user cart items in Redis |
| catalog-service | Node.js | 5002 | Lists, searches, and retrieves products from PostgreSQL |
| email-service | Python | 5003 | Sends order confirmation emails |
| shipping-service | C# (.NET 10) | 5004 | Returns shipping quotes and issues tracking IDs |
| currency-service | Node.js | 5005 | Converts money between currencies using live exchange rates |
| payment-service | C# (.NET 10) | 5006 | Charges credit cards via Stripe |
| checkout-service | Go | 5008 | Orchestrates PlaceOrder: cart → catalog → currency → payment → shipping → email |
| recommendation-service | Python | 5007 | Recommends products based on cart contents using category co-occurrence |
| frontend-service | React / TypeScript | 3000 | CURATOR storefront — product browsing, cart, checkout |

## Local Development (Docker Compose)

**Prerequisites:** Docker Desktop

```bash
cd deployments/docker
docker compose up --build
```

Services will be available at `localhost:5001` (cart), `localhost:5002` (catalog), `localhost:5003` (email), `localhost:5004` (shipping), `localhost:5005` (currency), `localhost:5006` (payment), `localhost:5008` (checkout) and `localhost:5007` (recommendation).

Email is in mock mode by default - sends are logged to stdout, no SMTP required.

catalog-service seeds 10 products into PostgreSQL on first startup automatically.

Note: catalog-service defaults to `CATALOG_BACKEND=postgres`. To test with Cosmos DB locally, set `CATALOG_BACKEND=cosmosdb` and `COSMOS_ENDPOINT` pointing to a Cosmos DB Emulator or live account.

shipping-service uses a mock implementation - quotes are calculated from item count and destination, tracking IDs are generated locally. No external carrier API or secrets required.

currency-service fetches live USD-based exchange rates from [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api) (no API key required). Rates are cached until midnight UTC with a stale fallback. An opossum circuit breaker protects against API outages, with automatic failover to the Cloudflare mirror.

payment-service uses [Stripe](https://stripe.com) in test mode - requires a free Stripe account and a `sk_test_...` key. Set `STRIPE_SECRET_KEY` in docker-compose for local dev. Card declines surface as `INVALID_ARGUMENT`; transient Stripe errors are retried up to 3 times with exponential backoff via Polly. Use test card `4242 4242 4242 4242` to simulate a successful charge.

checkout-service orchestrates the full order flow. It calls cart-service, catalog-service, currency-service, payment-service, shipping-service, and email-service in a single `PlaceOrder` RPC. Catalog lookups and currency conversions run in parallel via `errgroup`. The `order_id` UUID is passed to Stripe as an idempotency key - retrying `PlaceOrder` with the same `order_id` will not result in a double charge.

recommendation-service calls catalog-service via gRPC to fetch product data, caches it for 5 minutes, and returns up to 5 products sharing categories with the cart. Returns an empty list if catalog-service is unavailable.

The storefront is available at `http://localhost:3000` after `docker compose up --build`.

## Deploy to AKS

**Prerequisites:** `kubectl` configured against your AKS cluster, `kustomize`, Azure CNI with Network Policy support (required for Network Policies)

### 1. One-time cluster setup

**Enable Workload Identity and the Key Vault secrets provider:**
```bash
az aks update --enable-oidc-issuer --enable-workload-identity -n <cluster> -g <rg>
az aks enable-addons --addons azure-keyvault-secrets-provider -n <cluster> -g <rg>
```

### 2. Workload Identity — catalog-service

catalog-service authenticates to Azure PostgreSQL Flexible Server (or Cosmos DB) via an Entra ID token — no secret needed.

1. Create a User-Assigned Managed Identity and grant it access to the PostgreSQL Flexible Server (or Cosmos DB Built-in Data Contributor role)
2. Create a federated credential linking the `catalog-service-sa` ServiceAccount to the managed identity
3. In `deployments/k8s/components/workload-identity/serviceaccount.yaml` replace `<MANAGED_IDENTITY_CLIENT_ID>` with the identity's client ID
4. In `deployments/k8s/overlays/aks/catalog-service-patch.yaml` replace `<your-server>` and `<managed-identity-name>` with your values

**Cosmos DB (optional — replaces PostgreSQL):** set `CATALOG_BACKEND=cosmosdb` and `COSMOS_ENDPOINT` in the catalog patch. The service creates the container on first startup.

### 3. Workload Identity — payment-service (Key Vault CSI)

The Stripe key is fetched from Azure Key Vault via the CSI driver — `kubectl create secret` is not needed for payment.

1. Create a User-Assigned Managed Identity for payment-service
2. Grant it the **Key Vault Secrets User** role on your vault
3. Store the Stripe key in the vault with object name `stripe-secret-key`
4. Create a federated credential linking the `payment-service-sa` ServiceAccount to the managed identity
5. In `deployments/k8s/components/workload-identity/serviceaccount.yaml` replace `<PAYMENT_MANAGED_IDENTITY_CLIENT_ID>` with the identity's client ID
6. In `deployments/k8s/overlays/aks/payment-keyvault.yaml` replace `<PAYMENT_MANAGED_IDENTITY_CLIENT_ID>`, `<KEY_VAULT_NAME>`, and `<TENANT_ID>`

### 4. Create remaining secrets

**cart-service** (Azure Cache for Redis connection string):
```bash
kubectl create secret generic cart-service-secrets \
  --from-literal=redis-addr="<host>.redis.cache.windows.net:6380,password=<key>,ssl=True,abortConnect=False" \
  --dry-run=client -o yaml | kubectl apply -f -
```

**email-service** (SMTP credentials):
```bash
kubectl create secret generic email-service-secrets \
  --from-literal=smtp-host="<smtp-host>" \
  --from-literal=smtp-user="<user>" \
  --from-literal=smtp-password="<password>" \
  --from-literal=email-from="noreply@yourdomain.com" \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 5. Apply

```bash
kubectl apply -k deployments/k8s/overlays/aks/
```

### 6. Verify

```bash
kubectl get pods
kubectl get networkpolicies
kubectl get serviceaccounts
```

## Repository Structure

```
online-boutique/
├── src/
│   ├── cart-service/             # C# gRPC service
│   ├── catalog-service/          # Node.js gRPC service
│   ├── currency-service/         # Node.js gRPC service
│   ├── email-service/            # Python gRPC service
│   ├── payment-service/          # C# gRPC service
│   ├── checkout-service/         # Go gRPC service
│   └── shipping-service/         # C# gRPC service
│   └── recommendation-service/   # Python gRPC service
│   └── frontend-service/         # React Web App
├── deployments/
│   ├── docker/
│   │   └── docker-compose.yml
│   ├── envoy/
│   │   └── envoy.yaml
│   └── k8s/
│       ├── base/                 # shared manifests (deployments, services, RBAC)
│       ├── components/           # reusable mix-ins (workload-identity, network-policies)
│       └── overlays/aks/         # AKS-specific config + patches
└── docs/plans/                   # design docs and implementation plans
```
