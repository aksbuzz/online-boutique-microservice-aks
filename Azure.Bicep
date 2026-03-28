param location string = 'centralindia'

param acrName string = 'acr${uniqueString(resourceGroup().id)}'
param aksName string = 'online-boutique-aks'

param nodeCount int = 1
param nodeVmSize string = 'Standard_B2s_v2'

param keyVaultName string = 'kv-btq-${uniqueString(resourceGroup().id)}'

param catalogManagedIdentityName string = 'online-boutique-catalog-identity'
param paymentManagedIdentityName string = 'online-boutique-payment-identity'

param k8sNamespace string = 'default'
param catalogK8sServiceAccountName string = 'catalog-service-sa'
param paymentK8sServiceAccountName string = 'payment-service-sa'

param redisCacheName string = 'redis-${uniqueString(resourceGroup().id)}'

param dbServerName string = 'pg-boutique-${uniqueString(resourceGroup().id)}'
param dbAdminUser string = 'pgadmin'
@secure()
param dbAdminPassword string

param deployerPrincipalId string

//////////
// CORE //
/////////

// ACR
resource acr 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
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
resource aks 'Microsoft.ContainerService/managedClusters@2025-10-01' = {
  name: aksName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: aksName

    agentPoolProfiles: [
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

    addonProfiles: {
      azureKeyvaultSecretsProvider: {
        enabled: true
        config: {
          enableSecretRotation: 'true'
          rotationPollInterval: '2m'
        }
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
    enableSoftDelete: true
  }
}

// Redis Cache
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
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' = {
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
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Enabled'
    }
  }
}

// Allow all Azure-internal IPs (AKS pods) to reach the DB.
resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2025-08-01' = {
  parent: postgresServer
  name: 'AllowAzureIPs'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Create catalog database
resource catalogDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2025-08-01' = {
  parent: postgresServer
  name: 'catalog'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Allow AKS kubelet to pull images from ACR
resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aks.id, acr.id, 'acrpull')
  scope: acr
  properties: {
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull
    )
  }
}

/////////////////////////////
// CATALOG SERVICE IDENTITY //
/////////////////////////////

resource catalogIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: catalogManagedIdentityName
  location: location
}

// Federated credential: "a pod running as catalog-service-sa in the default
// namespace on THIS cluster is allowed to impersonate catalogIdentity."
resource catalogFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2024-11-30' = {
  parent: catalogIdentity
  name: 'aks-catalog-federated-credential'
  properties: {
    issuer: aks.properties.oidcIssuerProfile.issuerURL
    subject: 'system:serviceaccount:${k8sNamespace}:${catalogK8sServiceAccountName}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// Grant catalog identity permission to connect to PostgreSQL as an Entra user.
resource catalogPostgresRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(postgresServer.id, catalogIdentity.id, 'postgresContributor')
  scope: postgresServer
  properties: {
    principalId: catalogIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b24988ac-6180-42a0-ab88-20f7382dd24c' // Contributor
    )
  }
}

/////////////////////////////
// PAYMENT SERVICE IDENTITY //
/////////////////////////////

resource paymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: paymentManagedIdentityName
  location: location
}

// Federated credential for payment-service-sa
resource paymentFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2024-11-30' = {
  parent: paymentIdentity
  name: 'aks-payment-federated-credential'
  properties: {
    issuer: aks.properties.oidcIssuerProfile.issuerURL
    subject: 'system:serviceaccount:${k8sNamespace}:${paymentK8sServiceAccountName}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// Grant payment identity the ability to read secrets from Key Vault.
resource kvSecretReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, paymentIdentity.id, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    principalId: paymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6' // Key Vault Secrets User
    )
  }
}

// Grant deployer to put secrets in KV (Strapi secrets)
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, deployerPrincipalId, 'Key Vault Secrets Officer')
  scope: keyVault
  properties: {
    principalId: deployerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b86a8fe4-44ce-4948-aee5-eccb2c155cd7' // Key Vault Secrets Officer
    )
  }
}

resource redisSecret 'Microsoft.KeyVault/vaults/secrets@2025-05-01' = {
  parent: keyVault
  name: 'redis-addr'
  properties: {
    value: '${redisCache.properties.hostName}:6380,password=${redisCache.listKeys().primaryKey},ssl=True,abortConnect=False'
  }
}

// ── Outputs ───────────────────────────────────────
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output aksName string = aks.name
output aksOidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output tenantId string = subscription().tenantId

output catalogManagedIdentityClientId string = catalogIdentity.properties.clientId
output catalogManagedIdentityPrincipalId string = catalogIdentity.properties.principalId

output paymentManagedIdentityClientId string = paymentIdentity.properties.clientId
output paymentManagedIdentityPrincipalId string = paymentIdentity.properties.principalId

output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
output postgresServerName string = postgresServer.name

output redisHostName string = redisCache.properties.hostName
output redisName string = redisCache.name
