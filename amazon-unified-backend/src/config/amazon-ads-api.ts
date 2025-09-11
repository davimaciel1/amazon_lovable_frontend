/**
 * Amazon Advertising API Configuration
 * CRITICAL: This handles Campaigns, ACOS/TACOS metrics
 * DO NOT MODIFY credentials - they are ACTIVE and WORKING
 */

import { logger } from '../utils/logger';

export interface AdsAPIConfig {
  credentials: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    securityProfileId: string;
  };
  profiles: {
    US: string;
    CA: string;
    MX: string;
  };
  endpoints: {
    base: string;
    profiles: string;
    campaigns: string;
    adGroups: string;
    keywords: string;
    reports: string;
    metrics: string;
  };
  regions: {
    NA: string;
    EU: string;
    FE: string;
  };
}

// Advertising API Configuration - PRESERVE ALL VALUES
export const adsApiConfig: AdsAPIConfig = {
  credentials: {
    clientId: process.env.ADS_API_CLIENT_ID || '',
    clientSecret: process.env.ADS_API_CLIENT_SECRET || '',
    refreshToken: process.env.ADS_API_REFRESH_TOKEN || '',
    securityProfileId: process.env.ADS_API_SECURITY_PROFILE_ID || '',
  },
  profiles: {
    US: process.env.ADS_PROFILE_ID_US || '2658622232919159',
    CA: process.env.ADS_PROFILE_ID_CA || '1556088173648062',
    MX: process.env.ADS_PROFILE_ID_MX || '3991906933085820',
  },
  endpoints: {
    base: 'https://advertising-api.amazon.com',
    profiles: '/v2/profiles',
    campaigns: '/v2/sp/campaigns',
    adGroups: '/v2/sp/adGroups',
    keywords: '/v2/sp/keywords',
    reports: '/v2/reports',
    metrics: '/v2/sp/campaigns/metrics',
  },
  regions: {
    NA: 'https://advertising-api.amazon.com',
    EU: 'https://advertising-api-eu.amazon.com',
    FE: 'https://advertising-api-fe.amazon.com',
  }
};

// Validate Advertising API configuration
export function validateAdsAPIConfig(): boolean {
  const required = [
    adsApiConfig.credentials.clientId,
    adsApiConfig.credentials.clientSecret,
    adsApiConfig.credentials.refreshToken,
    adsApiConfig.credentials.securityProfileId,
  ];

  const missing = required.filter(value => !value);
  
  if (missing.length > 0) {
    logger.error('❌ Missing required Advertising API configuration');
    return false;
  }

  logger.info('✅ Advertising API configuration validated successfully', {
    securityProfileId: adsApiConfig.credentials.securityProfileId,
    profiles: Object.keys(adsApiConfig.profiles)
  });

  return true;
}

// Get profile ID by country code
export function getProfileId(countryCode: string): string {
  const profileMap: Record<string, string> = {
    'US': adsApiConfig.profiles.US,
    'CA': adsApiConfig.profiles.CA,
    'MX': adsApiConfig.profiles.MX,
  };

  return profileMap[countryCode.toUpperCase()] || adsApiConfig.profiles.US;
}

// Get all active profile IDs
export function getAllProfileIds(): string[] {
  return Object.values(adsApiConfig.profiles);
}

// Get API endpoint URL for region
export function getRegionEndpoint(region: string = 'NA'): string {
  const upperRegion = region.toUpperCase();
  const regions = adsApiConfig.regions as Record<string, string>;
  return regions[upperRegion] || adsApiConfig.regions.NA;
}

// ACOS Calculation: (Ad Spend / Attributed Sales) × 100
export function calculateACOS(adSpend: number, attributedSales: number): number {
  if (attributedSales === 0) return 0;
  return Number(((adSpend / attributedSales) * 100).toFixed(2));
}

// TACOS Calculation: (Total Ad Spend / Total Sales) × 100
export function calculateTACOS(totalAdSpend: number, totalSales: number): number {
  if (totalSales === 0) return 0;
  return Number(((totalAdSpend / totalSales) * 100).toFixed(2));
}
