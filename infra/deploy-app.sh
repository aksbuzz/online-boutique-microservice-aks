#!/usr/bin/env bash
# =============================================================================
# deploy-app.sh
#
# Usage (manual, build everything):
#   ./deploy-app.sh
#
# Usage (CI/CD, build and push only changed services):
#   SERVICES="catalog-service frontend-service" ./deploy-app.sh
#
# Usage (skip build, just re-apply manifests):
#   SKIP_BUILD=true ./deploy-app.sh
# =============================================================================
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
die()     { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

# ── Directories ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
K8S_DIR="$REPO_ROOT/deployments/k8s"
SRC_DIR="$REPO_ROOT/src"

# ── Configuration ─────────────────────────────────────────────────────────────
RESOURCE_GROUP="${RESOURCE_GROUP:-online-boutique-rg}"
SKIP_BUILD="${SKIP_BUILD:-false}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Default
ALL_SERVICES=(
  cart-service
  catalog-service
  checkout-service
  currency-service
  email-service
  frontend-service
  payment-service
  recommendation-service
  shipping-service
)
# Allow caller to narrow the build to specific services
if [[ -n "${SERVICES:-}" ]]; then
  IFS=' ' read -r -a BUILD_SERVICES <<< "$SERVICES"
else
  BUILD_SERVICES=("${ALL_SERVICES[@]}")
fi

# ── Flags ─────────────────────────────────────────────────────────────────────
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-5m}"

# ── Pre-flight checks ─────────────────────────────────────────────────────────
for cmd in az docker kubectl; do
  command -v "$cmd" &>/dev/null || die "'$cmd' is not installed or not on PATH."
done

az account show &>/dev/null || die "Not logged in to Azure. Run 'az login' first."

# ── Resolve ACR from current kustomization.yaml ───────────────────────────────
AKS_KUSTOMIZATION="$K8S_DIR/overlays/aks/kustomization.yaml"
[[ -f "$AKS_KUSTOMIZATION" ]] || die "kustomization.yaml not found. Did you run deploy-infra.sh first?"

ACR_LOGIN_SERVER=$(grep "newName:" "$AKS_KUSTOMIZATION" | head -n 1 | awk '{print $2}' | sed 's|/[^/]*$||')

[[ -z "$ACR_LOGIN_SERVER" ]] && die \
  "Could not determine ACR login server from kustomization.yaml. Run deploy-infra.sh first."

info "ACR login server : $ACR_LOGIN_SERVER"
info "Image tag        : $IMAGE_TAG"
info "Services to build: ${BUILD_SERVICES[*]}"

# # ── 1. ACR login ──────────────────────────────────────────────────────────────
info "Logging in to ACR..."
ACR_NAME="${ACR_LOGIN_SERVER%%.*}"
az acr login --name "$ACR_NAME"
success "ACR login OK."

# ── 2. Build & push images ────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == "true" ]]; then
  warn "SKIP_BUILD=true — skipping Docker build/push."
else
  if printf '%s\n' "${BUILD_SERVICES[@]}" | grep -q '^frontend-service$'; then
    if [[ -z "${VITE_STRIPE_PUBLISHABLE_KEY:-}" ]]; then
      echo -n "Enter Stripe publishable key (pk_test_...): "
      read -r VITE_STRIPE_PUBLISHABLE_KEY
    fi
  fi

  FAILED_SERVICES=()

  for svc in "${BUILD_SERVICES[@]}"; do
    SRC_PATH="$SRC_DIR/$svc"
    [[ -d "$SRC_PATH" ]] || { warn "Source not found for $svc at $SRC_PATH — skipping."; continue; }
    [[ -f "$SRC_PATH/Dockerfile" ]] || { warn "No Dockerfile for $svc — skipping."; continue; }

    IMAGE="${ACR_LOGIN_SERVER}/${svc}:${IMAGE_TAG}"
    info "Building $svc → $IMAGE"

    BUILD_ARGS=()
    if [[ "$svc" == "frontend-service" ]]; then
      BUILD_ARGS+=(--build-arg "VITE_STRIPE_PUBLISHABLE_KEY=${VITE_STRIPE_PUBLISHABLE_KEY}")
    fi

    # Build context is the repo root so Dockerfiles that COPY from sibling
    # directories work correctly (e.g. checkout-service copies proto files).
    if docker build \
        -t "$IMAGE" \
        "${BUILD_ARGS[@]}" \
        -f "$SRC_PATH/Dockerfile" \
        "$REPO_ROOT"; then
      success "Built $svc"
    else
      warn "Build failed for $svc — continuing with remaining services."
      FAILED_SERVICES+=("$svc")
      continue
    fi

    info "Pushing $IMAGE ..."
    if docker push "$IMAGE"; then
      success "Pushed $svc"
    else
      warn "Push failed for $svc."
      FAILED_SERVICES+=("$svc")
    fi
  done

  if [[ ${#FAILED_SERVICES[@]} -gt 0 ]]; then
    die "The following services failed to build/push: ${FAILED_SERVICES[*]}"
  fi
fi

# # ── 3. Create cart-service Redis secret in K8s ────────────────────────────────
The redis-addr comes from Key Vault (stored by deploy-infra.sh). We fetch it
here so the kubectl secret stays in sync on every deploy.
info "Syncing cart-service Redis secret from Key Vault..."
KV_NAME=$(az keyvault list \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].name" -o tsv 2>/dev/null || true)

if [[ -n "$KV_NAME" ]]; then
  REDIS_ADDR=$(az keyvault secret show \
    --vault-name "$KV_NAME" \
    --name "redis-addr" \
    --query "value" -o tsv 2>/dev/null || true)

  if [[ -n "$REDIS_ADDR" ]]; then
    kubectl create secret generic cart-service-secrets \
      --from-literal=redis-addr="$REDIS_ADDR" \
      --dry-run=client -o yaml | kubectl apply -f -
    success "cart-service-secrets updated."
  else
    warn "Could not read redis-addr from Key Vault — cart-service-secrets not updated."
    warn "Run manually: kubectl create secret generic cart-service-secrets --from-literal=redis-addr=<value>"
  fi
else
  warn "Could not determine Key Vault name — cart-service-secrets not updated."
fi

# # ── 4. Create email-service secrets (SMTP / log mode) ────────────────────────
# # In local/dev the base deployment sets EMAIL_BACKEND=log so no SMTP creds are
# # needed. In production, set EMAIL_SMTP_HOST etc. as env vars before running.
# if [[ -n "${EMAIL_SMTP_HOST:-}" ]]; then
#   info "Creating email-service-secrets (SMTP mode)..."
#   kubectl create secret generic email-service-secrets \
#     --from-literal=smtp-host="${EMAIL_SMTP_HOST}" \
#     --from-literal=smtp-user="${EMAIL_SMTP_USER:-}" \
#     --from-literal=smtp-password="${EMAIL_SMTP_PASSWORD:-}" \
#     --from-literal=email-from="${EMAIL_FROM:-noreply@example.com}" \
#     --dry-run=client -o yaml | kubectl apply -f -
#   success "email-service-secrets updated."
# else
#   info "EMAIL_SMTP_HOST not set — email-service will run in log (mock) mode."
# fi

# ── 5. Apply Kustomize overlay ────────────────────────────────────────────────
info "Applying Kustomize AKS overlay..."
kubectl apply -k "$K8S_DIR/overlays/aks/"
success "Kubernetes manifests applied."

# ── 6. Wait for rollout ───────────────────────────────────────────────────────
info "Waiting for deployments to roll out (timeout: $ROLLOUT_TIMEOUT)..."
ROLLOUT_FAILED=()

for svc in "${ALL_SERVICES[@]}"; do
  info "  → $svc"
  if ! kubectl rollout status deployment/"$svc" \
       --timeout="$ROLLOUT_TIMEOUT" 2>/dev/null; then
    warn "Rollout did not complete for $svc within $ROLLOUT_TIMEOUT."
    ROLLOUT_FAILED+=("$svc")
  fi
done

# ── 7. Show pod status ────────────────────────────────────────────────────────
echo ""
info "Current pod status:"
kubectl get pods -o wide

# ── 8. Fetch the frontend external IP ────────────────────────────────────────
echo ""
info "Waiting for frontend-service LoadBalancer IP (up to 3 min)..."
EXTERNAL_IP=""
for i in $(seq 1 18); do
  EXTERNAL_IP=$(kubectl get service frontend-service \
    --output jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  [[ -n "$EXTERNAL_IP" ]] && break
  sleep 10
done

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Deployment complete!${RESET}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo ""

if [[ -n "$EXTERNAL_IP" ]]; then
  echo -e "${BOLD}  Storefront: ${GREEN}http://${EXTERNAL_IP}${RESET}"
else
  warn "External IP not yet assigned. Check with:"
  echo "    kubectl get service frontend-service"
fi

echo ""

if [[ ${#ROLLOUT_FAILED[@]} -gt 0 ]]; then
  echo -e "${YELLOW}${BOLD}The following deployments did not finish rolling out in time:${RESET}"
  for svc in "${ROLLOUT_FAILED[@]}"; do
    echo "  - $svc"
  done
  echo ""
  echo "Investigate with:"
  echo "  kubectl describe pod -l app=<service>"
  echo "  kubectl logs deployment/<service>"
fi
