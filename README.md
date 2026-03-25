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

## Local Development (Docker Compose)

**Prerequisites:** Docker Desktop

```bash
cd deployments/docker
docker compose up --build
```

Services will be available at `localhost:5001` (cart), `localhost:5002` (catalog), `localhost:5003` (email), `localhost:5004` (shipping), and `localhost:5005` (currency).

Email is in mock mode by default - sends are logged to stdout, no SMTP required.

catalog-service seeds 10 products into PostgreSQL on first startup automatically.

shipping-service uses a mock implementation - quotes are calculated from item count and destination, tracking IDs are generated locally. No external carrier API or secrets required.

currency-service fetches live USD-based exchange rates from [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api) (no API key required). Rates are cached until midnight UTC with a stale fallback. An opossum circuit breaker protects against API outages, with automatic failover to the Cloudflare mirror.

## Deploy to AKS

**Prerequisites:** `kubectl` configured against your AKS cluster, `kustomize`

### 1. Create secrets

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

**catalog-service** uses [Workload Identity](https://azure.github.io/azure-workload-identity/docs/) - no secret needed. The pod authenticates to Azure PostgreSQL Flexible Server via an Entra ID token fetched at runtime.

Before deploying, complete the one-time setup:
1. Enable Workload Identity on the cluster: `az aks update --enable-oidc-issuer --enable-workload-identity -n <cluster> -g <rg>`
2. Create a User-Assigned Managed Identity and grant it access to the PostgreSQL Flexible Server
3. Create a federated credential linking the `catalog-service-sa` Kubernetes ServiceAccount to the managed identity
4. Update `deployments/k8s/components/workload-identity/serviceaccount.yaml` - replace `<MANAGED_IDENTITY_CLIENT_ID>` with the identity's client ID
5. Update `deployments/k8s/overlays/aks/catalog-service-patch.yaml` - replace `<your-server>` and `<managed-identity-name>` with your values

### 2. Apply

```bash
kubectl apply -k deployments/k8s/overlays/aks/
```

### 3. Verify

```bash
kubectl get pods
kubectl get services
```

## Repository Structure

```
online-boutique/
├── src/
│   ├── cart-service/       # C# gRPC service
│   ├── catalog-service/    # Node.js gRPC service
│   ├── currency-service/   # Node.js gRPC service
│   ├── email-service/      # Python gRPC service
│   └── shipping-service/   # C# gRPC service
├── deployments/
│   ├── docker/
│   │   └── docker-compose.yml
│   └── k8s/
│       ├── base/           # shared manifests
│       ├── components/     # reusable mix-ins (workload-identity)
│       └── overlays/aks/   # AKS-specific config + patches
└── docs/plans/             # design docs and implementation plans
```
