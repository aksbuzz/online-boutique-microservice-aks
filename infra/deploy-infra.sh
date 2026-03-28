#!/usr/bin/env bash
# =============================================================================
# deploy-infra.sh
#
#
# Usage (interactive / first-time manual setup):
#   ./deploy-infra.sh --stripe-key sk_test_xxxx
#
# Usage (CI/CD — pass secrets via environment variables):
#   DB_ADMIN_PASSWORD=xxx STRIPE_SECRET_KEY=sk_test_xxx ./deploy-infra.sh --ci
# =============================================================================
set -euo pipefail

# -- Colour helpers ------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
die()     { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

# -- Defaults -------------------------------------
RESOURCE_GROUP="${RESOURCE_GROUP:-online-boutique-rg}"
LOCATION="${LOCATION:-centralindia}"
BICEP_FILE="${BICEP_FILE:-$(dirname "$0")/../Azure.Bicep}"
K8S_DIR="${K8S_DIR:-$(dirname "$0")/../deployments/k8s}"
CI_MODE=false
STRIPE_KEY=""

# -- Argument parsing ----------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --stripe-key)   STRIPE_KEY="$2";  shift 2 ;;
    --rg)           RESOURCE_GROUP="$2"; shift 2 ;;
    --location)     LOCATION="$2"; shift 2 ;;
    --ci)           CI_MODE=true; shift ;;
    *) die "Unknown argument: $1" ;;
  esac
done

if [[ "$CI_MODE" == true ]]; then
  STRIPE_KEY="${STRIPE_SECRET_KEY:-}"
fi

[[ -z "$STRIPE_KEY" ]] && die "Stripe secret key is required. Pass --stripe-key or set STRIPE_SECRET_KEY env var."

# -- Pre-flight checks ---------------------------------------------------------
for cmd in az kubectl jq; do
  command -v "$cmd" &>/dev/null || die "'$cmd' is not installed or not on PATH."
done

az account show &>/dev/null || die "Not logged in to Azure. Run 'az login' first."

info "Using subscription: $(az account show --query name -o tsv)"
info "Resource group   : $RESOURCE_GROUP"
info "Location         : $LOCATION"

# -- 1. Resource group ---------------------------------------------------------
info "Creating resource group (idempotent)..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
success "Resource group ready."

# -- 2. Bicep deployment -------------------------------------------------------
info "Fetching current deployer Principal ID..."
DEPLOYER_ID=$(az ad signed-in-user show --query id -o tsv 2>/dev/null || az account show --query user.name -o tsv)

info "Deploying Bicep template..."

# Resolve the DB password
if [[ -z "${DB_ADMIN_PASSWORD:-}" ]]; then
  if [[ "$CI_MODE" == true ]]; then
    die "DB_ADMIN_PASSWORD env var must be set in CI mode."
  fi
  echo -n "Enter PostgreSQL admin password: "
  read -rs DB_ADMIN_PASSWORD
  echo
fi

DEPLOY_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$BICEP_FILE" \
  --parameters \
    dbAdminPassword="$DB_ADMIN_PASSWORD" \
    deployerPrincipalId="$DEPLOYER_ID" \
  --output json)

success "Bicep deployment complete."

# -- 3. Capture outputs --------------------------------------------------------
info "Reading deployment outputs..."

get_output() { echo "$DEPLOY_OUTPUT" | jq -r ".properties.outputs.$1.value"; }

ACR_NAME=$(get_output "acrName")
ACR_LOGIN_SERVER=$(get_output "acrLoginServer")
AKS_NAME=$(get_output "aksName")
KEY_VAULT_NAME=$(get_output "keyVaultName")
KEY_VAULT_URI=$(get_output "keyVaultUri")
TENANT_ID=$(get_output "tenantId")

CATALOG_CLIENT_ID=$(get_output "catalogManagedIdentityClientId")
PAYMENT_CLIENT_ID=$(get_output "paymentManagedIdentityClientId")

POSTGRES_FQDN=$(get_output "postgresServerFqdn")
POSTGRES_SERVER_NAME=$(get_output "postgresServerName")

REDIS_HOST=$(get_output "redisHostName")

info "ACR              : $ACR_LOGIN_SERVER"
info "AKS              : $AKS_NAME"
info "Key Vault        : $KEY_VAULT_NAME"
info "Postgres FQDN    : $POSTGRES_FQDN"
info "Redis host       : $REDIS_HOST"
info "Catalog clientId : $CATALOG_CLIENT_ID"
info "Payment clientId : $PAYMENT_CLIENT_ID"

# -- 4. Store Stripe secret in Key Vault ---------------------------------------
info "Storing Stripe secret in Key Vault..."
az keyvault secret set \
  --vault-name "$KEY_VAULT_NAME" \
  --name "stripe-secret-key" \
  --value "$STRIPE_KEY" \
  --output none
success "Stripe secret stored."

# -- 5. Connect kubectl --------------------------------------------------------
info "Configuring kubectl..."
az aks get-credentials \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AKS_NAME" \
  --overwrite-existing
success "kubectl configured. Nodes:"
kubectl get nodes

# -- 6. Patch workload-identity ServiceAccounts --------------------------------
WORKLOAD_SA_FILE="$K8S_DIR/components/workload-identity/serviceaccount.yaml"
info "Patching $WORKLOAD_SA_FILE ..."

TEMP_SA=$(mktemp)
sed \
  -e "s|<CATALOG_MANAGED_IDENTITY_CLIENT_ID>|${CATALOG_CLIENT_ID}|g" \
  -e "s|<PAYMENT_MANAGED_IDENTITY_CLIENT_ID>|${PAYMENT_CLIENT_ID}|g" \
  "$WORKLOAD_SA_FILE" > "$TEMP_SA"
cp "$TEMP_SA" "$WORKLOAD_SA_FILE"
rm "$TEMP_SA"
success "ServiceAccount file patched."

# -- 7. payment SecretProviderClass ---------------------------------
PAYMENT_KV_FILE="$K8S_DIR/overlays/aks/payment-keyvault.yaml"
info "Patching $PAYMENT_KV_FILE ..."
TEMP_KV=$(mktemp)
sed \
  -e "s|<PAYMENT_MANAGED_IDENTITY_CLIENT_ID>|${PAYMENT_CLIENT_ID}|g" \
  -e "s|<KEY_VAULT_NAME>|${KEY_VAULT_NAME}|g" \
  -e "s|<TENANT_ID>|${TENANT_ID}|g" \
  "$PAYMENT_KV_FILE" > "$TEMP_KV"
cp "$TEMP_KV" "$PAYMENT_KV_FILE"
rm "$TEMP_KV"
success "payment-keyvault.yaml patched."

# -- 8. catalog-service Kustomize patch ---------------------------------
CATALOG_PATCH_FILE="$K8S_DIR/overlays/aks/catalog-service-patch.yaml"
info "Patching $CATALOG_PATCH_FILE ..."
TEMP_CAT=$(mktemp)
CATALOG_IDENTITY_NAME="online-boutique-catalog-identity"
sed \
  -e "s|<POSTGRES_SERVER_NAME>|${POSTGRES_SERVER_NAME}|g" \
  -e "s|<CATALOG_MANAGED_IDENTITY_NAME>|${CATALOG_IDENTITY_NAME}|g" \
  "$CATALOG_PATCH_FILE" > "$TEMP_CAT"
cp "$TEMP_CAT" "$CATALOG_PATCH_FILE"
rm "$TEMP_CAT"

# -- 9. AKS kustomization image overrides ---------------------------
AKS_KUSTOMIZATION="$K8S_DIR/overlays/aks/kustomization.yaml"
info "Writing image overrides to $AKS_KUSTOMIZATION ..."

# 1. Remove any existing 'images:' section to avoid duplicates (simplistic approach)
sed -i '/images:/,$d' "$AKS_KUSTOMIZATION"

# 2. Append the new images section
cat <<EOF >> "$AKS_KUSTOMIZATION"


images:
  - name: cart-service
    newName: ${ACR_LOGIN_SERVER}/cart-service
    newTag: latest
  - name: catalog-service
    newName: ${ACR_LOGIN_SERVER}/catalog-service
    newTag: latest
  - name: checkout-service
    newName: ${ACR_LOGIN_SERVER}/checkout-service
    newTag: latest
  - name: currency-service
    newName: ${ACR_LOGIN_SERVER}/currency-service
    newTag: latest
  - name: email-service
    newName: ${ACR_LOGIN_SERVER}/email-service
    newTag: latest
  - name: frontend-service
    newName: ${ACR_LOGIN_SERVER}/frontend-service
    newTag: latest
  - name: payment-service
    newName: ${ACR_LOGIN_SERVER}/payment-service
    newTag: latest
  - name: recommendation-service
    newName: ${ACR_LOGIN_SERVER}/recommendation-service
    newTag: latest
  - name: shipping-service
    newName: ${ACR_LOGIN_SERVER}/shipping-service
    newTag: latest
EOF

success "kustomization.yaml updated."

# -- Summary -------------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Infrastructure provisioning complete!${RESET}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "${BOLD}${YELLOW}Manual post-deploy step required — PostgreSQL Entra user:${RESET}"
echo ""
echo "  The catalog-service managed identity must be added as a PostgreSQL"
echo "  Entra admin before it can authenticate. Run these commands once:"
echo ""
echo "  # 1. Add your own Entra account as PG Entra admin (one-time)"
echo "  az postgres flexible-server microsoft-entra-admin create \\"
echo "    --resource-group $RESOURCE_GROUP \\"
echo "    --server-name   $POSTGRES_SERVER_NAME \\"
echo "    --display-name  \"\$(az ad signed-in-user show --query userPrincipalName -o tsv)\" \\"
echo "    --object-id     \"\$(az ad signed-in-user show --query id -o tsv)\" \\"
echo "    --type          User"
echo ""
echo "  # 2. Connect to the 'postgres' database to create the role"
echo "  PGPASSWORD=\$(az account get-access-token \\"
echo "    --resource-type oss-rdbms --query accessToken -o tsv) \\"
echo "  psql \"host=$POSTGRES_FQDN dbname=catalog user=\$(az ad signed-in-user show --query userPrincipalName -o tsv) sslmode=require\" <<'SQL'"
echo "    SELECT * FROM pgaadauth_create_principal(\"online-boutique-catalog-identity\", false, false);"
echo "  SQL"
echo ""
echo "  # 3. Connect to the 'catalog' database to grant permissions"
echo "  PGPASSWORD=\$(az account get-access-token \\"
echo "    --resource-type oss-rdbms --query accessToken -o tsv) \\"
echo "  psql \"host=$POSTGRES_FQDN dbname=catalog user=\$(az ad signed-in-user show --query userPrincipalName -o tsv) sslmode=require\" <<'SQL'"
echo "    GRANT ALL PRIVILEGES ON DATABASE catalog TO \"online-boutique-catalog-identity\";"
echo "    GRANT ALL ON SCHEMA public TO \"online-boutique-catalog-identity\";"
echo "  SQL"
