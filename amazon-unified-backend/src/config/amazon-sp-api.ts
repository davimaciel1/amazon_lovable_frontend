/**
 * Amazon SP-API Configuration
 * CRITICAL: This handles Orders, Products, Inventory, and Finance data
 * DO NOT MODIFY credentials - they are ACTIVE and WORKING
 */

import { logger } from '../utils/logger';

export interface SPAPIConfig {
  credentials: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    sellerId: string;
  };
  region: string;
  marketplaces: {
    US: string;
    CA: string;
    MX: string;
  };
  endpoints: {
    orders: string;
    products: string;
    inventory: string;
    finance: string;
  };
}

// SP-API Configuration - PRESERVE ALL VALUES
export const spApiConfig: SPAPIConfig = {
  credentials: {
    clientId: process.env.SP_API_CLIENT_ID || '',
    clientSecret: process.env.SP_API_CLIENT_SECRET || '',
    refreshToken: process.env.SP_API_REFRESH_TOKEN || '',
    sellerId: process.env.AMAZON_SELLER_ID || '',
  },
  region: process.env.SP_API_REGION || 'na',
  marketplaces: {
    US: process.env.MARKETPLACE_ID_US || 'ATVPDKIKX0DER',
    CA: process.env.MARKETPLACE_ID_CA || 'A2EUQ1WTGCTBG2',
    MX: process.env.MARKETPLACE_ID_MX || 'A1AM78C64UM0Y8',
  },
  endpoints: {
    orders: '/orders/v0/orders',
    products: '/catalog/2022-04-01/items',
    inventory: '/fba/inventory/v1/summaries',
    finance: '/finances/v0/financialEvents',
  }
};

// Validate SP-API configuration
export function validateSPAPIConfig(): boolean {
  const required = [
    spApiConfig.credentials.clientId,
    spApiConfig.credentials.clientSecret,
    spApiConfig.credentials.refreshToken,
    spApiConfig.credentials.sellerId,
  ];

  const missing = required.filter(value => !value);
  
  if (missing.length > 0) {
    logger.error('❌ Missing required SP-API configuration');
    return false;
  }

  logger.info('✅ SP-API configuration validated successfully', {
    sellerId: spApiConfig.credentials.sellerId,
    region: spApiConfig.region,
    marketplaces: Object.keys(spApiConfig.marketplaces)
  });

  return true;
}

// Get marketplace ID by country code
export function getMarketplaceId(countryCode: string): string {
  const marketplaceMap: Record<string, string> = {
    'US': spApiConfig.marketplaces.US,
    'CA': spApiConfig.marketplaces.CA,
    'MX': spApiConfig.marketplaces.MX,
  };

  return marketplaceMap[countryCode.toUpperCase()] || spApiConfig.marketplaces.US;
}

// Get all active marketplace IDs
export function getAllMarketplaceIds(): string[] {
  return Object.values(spApiConfig.marketplaces);
}
