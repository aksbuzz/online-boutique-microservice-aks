param location string = 'centralindia'
// param resourceGroupName string = 'online-boutique-rg'

param acrName string = 'acr${uniqueString(resourceGroup().id)}'
param aksName string = 'online-boutique-aks'

param nodeCount int = 1
param nodeVmSize string = 'Standard_B2s_v2'

param keyVaultName string = 'kv-btq-${uniqueString(resourceGroup().id)}'
param managedIdentityName string = 'online-boutique-identity'
param k8sNamespace string = 'default'
param k8sServiceAccountName string = 'online-boutique-sa'

param redisCacheName string = 'redis-${uniqueString(resourceGroup().id)}'

param dbServerName string = 'pg-boutique-${uniqueString(resourceGroup().id)}'
param dbAdminUser string = 'pgadmin'
@secure()
param dbAdminPassword string

//////////
// CORE //
/////////

// ACR
resource acr 'Microsoft.ContainerRegistry/registries@2026-01-01-preview' = {
  name: acrName
  location: location
  sku: { 
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

// AKS Cluster
// Features Enabled
//  1. OIDC Issuer / Workload Identity - enables pods to auth to Azure services
//  2. Azure CNI: every pod get a real IP from Azure VN
resource aks 'Microsoft.ContainerService/managedClusters@2025-10-02-preview' = {
  name: aksName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: aksName

    agentPoolProfiles:[
      {
        name: 'nodepool1'
        count: nodeCount
        vmSize: nodeVmSize
        osType: 'Linux'
        mode: 'System'
      }
    ]

    oidcIssuerProfile: {
      enabled: true
    }

    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }

    networkProfile: {
      networkPlugin: 'azure'
    }
  }
}

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2025-05-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
  }
}

// Redis
resource redisCache 'Microsoft.Cache/redis@2024-11-01' = {
  name: redisCacheName
  location: location
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    publicNetworkAccess: 'Enabled'
  }
}

// PostgreSQL
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2026-01-01-preview' = {
  name: dbServerName
  location: location
  sku: {
    name: 'Standard_B2ms'
    tier: 'Burstable'
  }
  properties: {
    version: '17'
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: 32
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// Allows other azure services (like AKS) to connect to DB
resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2026-01-01-preview' = {
  parent: postgresServer
  name: 'AllowAzureIPs'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

//////////
// GLUE //
/////////

// Allow AKS to download images from ACR and run a container.
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aks.id, acr.id, 'acrpull')
  scope: acr
  properties: {
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull Role
    )
  }
}

///////////////////////
// PODS TO KEY-VAULT //
///////////////////////

// User Assigned Managed Identity
resource workloadIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2025-01-31-preview' = {
  name: managedIdentityName
  location: location
}

// Links Azure Identity to a specific K8S Service Account in AKS
// "If a pod in the 'default' namespace uses the 'online-boutique-sa' account, treat it as this Azure Managed Identity."
resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2025-01-31-preview' = {
  parent: workloadIdentity
  name: 'aks-federated-credential'
  properties: {
    issuer: aks.properties.oidcIssuerProfile.issuerURL
    subject: 'system:serviceaccount:${k8sNamespace}:${k8sServiceAccountName}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// Grant managed identity permissions to read secrets 
resource kvSecretReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, workloadIdentity.id, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    principalId: workloadIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

// Store Redis conn in KV
resource redisSecret 'Microsoft.KeyVault/vaults/secrets@2025-05-01' = {
  parent: keyVault
  name: 'redis-addr'
  properties: {
    value: '${redisCache.properties.hostName}:6380,password=${redisCache.listKeys().primaryKey},ssl=True,abortConnect=False'
  }
}

// Outputs
output aksOidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL
output managedIdentityClientId string = workloadIdentity.properties.clientId
output keyVaultUri string = keyVault.properties.vaultUri
output postgresServerName string = postgresServer.name
output redisName string = redisCache.name
