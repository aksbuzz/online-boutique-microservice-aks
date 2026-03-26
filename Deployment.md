Phase 1 — Prerequisites (one-time setup)
Step 1: Install tools

# 1. Azure CLI
winget install Microsoft.AzureCLI

# 2. kubectl
az aks install-cli

# 3. Docker Desktop (for building images)
# Download from docker.com

# 4. Verify everything works
az --version
kubectl version --client
docker --version
Step 2: Login to Azure

az login
az account set --subscription "<your-subscription-id>"
Step 3: Create a Resource Group

az group create --name online-boutique-rg --location eastus
Step 4: Create an Azure Container Registry (ACR)
This is where your Docker images will live.


az acr create \
  --resource-group online-boutique-rg \
  --name <youruniquename>acr \
  --sku Basic

# Login to it
az acr login --name <youruniquename>acr
Step 5: Create the AKS cluster

az aks create \
  --resource-group online-boutique-rg \
  --name online-boutique-aks \
  --node-count 2 \
  --node-vm-size Standard_B2s \
  --generate-ssh-keys \
  --attach-acr <youruniquename>acr \
  --enable-oidc-issuer \
  --enable-workload-identity

# Connect kubectl to your cluster
az aks get-credentials \
  --resource-group online-boutique-rg \
  --name online-boutique-aks

# Verify connection
kubectl get nodes
Phase 2 — Build & Push Docker Images
Each service has its own Dockerfile. You need to build and push them all to ACR.

Step 6: Build and push all images

ACR_NAME="<youruniquename>acr"
ACR_URL="$ACR_NAME.azurecr.io"

# From project root — repeat for each service:
SERVICES=(cart-service catalog-service checkout-service currency-service email-service frontend-service payment-service recommendation-service shipping-service)

for svc in "${SERVICES[@]}"; do
  docker build -t "$ACR_URL/$svc:latest" "src/$svc"
  docker push "$ACR_URL/$svc:latest"
done
Tip: You can deploy just 1-2 services first (see Phase 4 below).

Phase 3 — Configure AKS-specific settings
Step 7: Fill in the placeholder values in AKS patches
Open deployments/k8s/overlays/aks/catalog-service-patch.yaml and replace:

<your-server> → your PostgreSQL server name
<managed-identity-name> → your Azure managed identity name
<your-cosmos-account> → your CosmosDB account name (if using CosmosDB)
Step 8: Set up Workload Identity (for services that need Azure resources)

# Create a managed identity
az identity create \
  --name online-boutique-identity \
  --resource-group online-boutique-rg

# Get the OIDC issuer URL
OIDC_ISSUER=$(az aks show \
  --resource-group online-boutique-rg \
  --name online-boutique-aks \
  --query "oidcIssuerProfile.issuerUrl" -o tsv)
Step 9: Set up Key Vault for Stripe secret

# Create Key Vault
az keyvault create \
  --name online-boutique-kv \
  --resource-group online-boutique-rg \
  --location eastus

# Store Stripe secret
az keyvault secret set \
  --vault-name online-boutique-kv \
  --name stripe-secret-key \
  --value "sk_test_..."
Step 10: Update image references in kustomization
Create/edit deployments/k8s/overlays/aks/kustomization.yaml to add image overrides:


# Add this section to the existing kustomization.yaml
images:
  - name: frontend-service
    newName: <youruniquename>acr.azurecr.io/frontend-service
    newTag: latest
  - name: cart-service
    newName: <youruniquename>acr.azurecr.io/cart-service
    newTag: latest
  # ... repeat for all services
Phase 4 — Deploy (incremental approach)
Yes, you can absolutely deploy parts at a time! Here's how:

Option A: Deploy a single service manually

kubectl apply -f deployments/k8s/base/frontend-service/
Option B: Deploy core services first (no external dependencies)
These services have no Azure-specific dependencies:


kubectl apply -f deployments/k8s/base/currency-service/
kubectl apply -f deployments/k8s/base/shipping-service/
kubectl apply -f deployments/k8s/base/recommendation-service/
kubectl apply -f deployments/k8s/base/cart-service/
kubectl apply -f deployments/k8s/base/envoy/
Option C: Deploy everything via Kustomize (full AKS overlay)

kubectl apply -k deployments/k8s/overlays/aks/
Monitor deployments

# Watch all pods come up
kubectl get pods -w

# Check a specific service
kubectl describe pod <pod-name>

# View logs
kubectl logs deployment/frontend-service
Access the app

# Get the external IP of the frontend (LoadBalancer)
kubectl get service frontend-service
# Wait for EXTERNAL-IP to appear, then open it in your browser
Recommended beginner order

Step 1-5  → Infrastructure (one-time, ~30 min)
Step 6    → Build images for simple services first (currency, shipping, recommendation)
Option B  → Deploy those 3-4 services, verify they run
Step 7-9  → Configure Azure integrations (DB, Key Vault)
Step 6    → Build remaining services
Option C  → Deploy everything
Common issues to watch for
Problem	Fix
ImagePullBackOff	ACR name wrong or --attach-acr not set on cluster
CrashLoopBackOff	Check logs: kubectl logs <pod>
Pending pod	Not enough nodes — scale up or use larger VM
Frontend has no EXTERNAL-IP	Wait 2-3 min; LoadBalancer provisioning takes time
Want me to help you start with a specific phase, or do you want me to check if any of your Dockerfiles or k8s manifests need fixes before deploying?