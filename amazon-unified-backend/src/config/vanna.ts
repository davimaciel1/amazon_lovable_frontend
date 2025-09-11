/**
 * Vanna AI Configuration
 * Provides integration settings for an external Vanna AI service
 */

export interface VannaConfig {
  enabled: boolean;
  baseUrl: string; // e.g., http://localhost:8050
  timeoutMs: number;
}

export const vannaConfig: VannaConfig = {
  enabled: process.env.VANNA_ENABLED === 'true',
  baseUrl: process.env.VANNA_BASE_URL || 'http://127.0.0.1:8050',
  timeoutMs: Number(process.env.VANNA_TIMEOUT_MS || 20000),
};

