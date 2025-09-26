/**
 * Serviço para buscar códigos MLB reais da API do Mercado Livre
 * Substitui códigos MLB inventados por códigos reais verificados
 */

import axios from 'axios';
import { pool } from '../config/database';

const ML_API_BASE = 'https://api.mercadolibre.com';
const SITE_ID = 'MLB'; // Brasil

export interface MLProduct {
  id: string; // MLB code real
  title: string;
  price: number;
  thumbnail: string;
  permalink: string;
  category_id: string;
  condition: string;
  seller: {
    id: number;
    nickname: string;
  };
}

export interface MLItemDetail {
  id: string;
  title: string;
  price: number;
  pictures: Array<{
    id: string;
    url: string;
    secure_url: string;
    max_size: string;
  }>;
  permalink: string;
  category_id: string;
  condition: string;
  status: string;
}

export class MercadoLivreLookupService {
  
  constructor() {
    // Token agora é buscado dinamicamente a cada requisição
  }

  /**
   * Busca access token atualizado do banco de dados com renovação automática
   */
  private async getAccessToken(): Promise<string | null> {
    try {
      const result = await pool.query(
        `SELECT credential_value FROM ml_credentials 
         WHERE credential_key = 'ML_ACCESS_TOKEN' AND is_active = true`
      );
      
      if (result.rows.length === 0) {
        console.warn('⚠️ ML_ACCESS_TOKEN não encontrado, tentando renovar...');
        return await this.renewAccessToken();
      }
      
      const accessToken = result.rows[0].credential_value;
      
      // Verifica se é um token placeholder ou inválido
      if (!accessToken || accessToken === 'FORCE_REFRESH' || accessToken.length < 20) {
        console.log('🔄 Token inválido detectado, renovando automaticamente...');
        return await this.renewAccessToken();
      }
      
      return accessToken;
    } catch (error: any) {
      console.error('❌ Erro ao buscar ML access token do banco:', error.message);
      return await this.renewAccessToken();
    }
  }

  /**
   * Renova access token usando refresh token
   */
  private async renewAccessToken(): Promise<string | null> {
    try {
      console.log('🔄 Iniciando renovação automática do access token...');
      
      // Busca refresh token e credenciais
      const credentialsResult = await pool.query(
        `SELECT credential_key, credential_value FROM ml_credentials 
         WHERE credential_key IN ('ML_REFRESH_TOKEN', 'ML_CLIENT_ID', 'ML_CLIENT_SECRET') 
         AND is_active = true`
      );
      
      const credentials: Record<string, string> = {};
      credentialsResult.rows.forEach(row => {
        credentials[row.credential_key] = row.credential_value;
      });
      
      if (!credentials.ML_REFRESH_TOKEN || !credentials.ML_CLIENT_ID || !credentials.ML_CLIENT_SECRET) {
        console.error('❌ Credenciais ML insuficientes para renovação:', {
          hasRefreshToken: !!credentials.ML_REFRESH_TOKEN,
          hasClientId: !!credentials.ML_CLIENT_ID,
          hasClientSecret: !!credentials.ML_CLIENT_SECRET
        });
        return null;
      }
      
      console.log('✅ Credenciais encontradas, fazendo requisição de renovação...');
      
      // Faz requisição de renovação do token
      const tokenResponse = await axios.post('https://api.mercadolibre.com/oauth/token', {
        grant_type: 'refresh_token',
        client_id: credentials.ML_CLIENT_ID,
        client_secret: credentials.ML_CLIENT_SECRET,
        refresh_token: credentials.ML_REFRESH_TOKEN
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      });
      
      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      if (!access_token) {
        console.error('❌ Renovação falhou - token não retornado');
        return null;
      }
      
      console.log('✅ Tokens renovados com sucesso!');
      
      // Atualiza tokens no banco de dados
      await pool.query('BEGIN');
      
      await pool.query(
        `UPDATE ml_credentials 
         SET credential_value = $1, updated_at = NOW() 
         WHERE credential_key = 'ML_ACCESS_TOKEN'`,
        [access_token]
      );
      
      if (refresh_token) {
        await pool.query(
          `UPDATE ml_credentials 
           SET credential_value = $1, updated_at = NOW() 
           WHERE credential_key = 'ML_REFRESH_TOKEN'`,
          [refresh_token]
        );
      }
      
      if (expires_in) {
        const expiryTime = Date.now() + (expires_in * 1000);
        await pool.query(
          `INSERT INTO ml_credentials (credential_key, credential_value, is_active, updated_at)
           VALUES ('ML_ACCESS_TOKEN_EXPIRES_AT', $1, true, NOW())
           ON CONFLICT (credential_key) 
           DO UPDATE SET credential_value = EXCLUDED.credential_value, updated_at = NOW()`,
          [expiryTime.toString()]
        );
      }
      
      await pool.query('COMMIT');
      
      console.log('✅ Tokens salvos no banco de dados');
      return access_token;
      
    } catch (error: any) {
      await pool.query('ROLLBACK');
      console.error('❌ Erro na renovação automática do token:', error.message);
      
      if (error.response?.status === 400) {
        console.error('❌ Refresh token pode estar expirado ou inválido');
      }
      
      return null;
    }
  }

  /**
   * Busca seller ID do usuário autenticado com retry em caso de token expirado
   */
  private async getSellerId(): Promise<number | null> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return null;

      const response = await axios.get(`${ML_API_BASE}/users/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      return response.data.id;
    } catch (error: any) {
      // Se erro 401/403, tenta renovar o token uma vez
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('🔄 Token possivelmente expirado, tentando renovar e repetir...');
        const newToken = await this.renewAccessToken();
        
        if (newToken) {
          try {
            const retryResponse = await axios.get(`${ML_API_BASE}/users/me`, {
              headers: {
                'Authorization': `Bearer ${newToken}`,
                'Accept': 'application/json'
              },
              timeout: 10000
            });
            return retryResponse.data.id;
          } catch (retryError: any) {
            console.error('❌ Retry falhou ao buscar seller ID:', retryError.message);
          }
        }
      }
      
      console.error('❌ Erro ao buscar seller ID:', error.message);
      return null;
    }
  }

  /**
   * Busca produtos do seller autenticado por SKU
   * Usa endpoint privado autenticado - encontra produtos do próprio seller
   */
  async searchProductsBySKU(sku: string): Promise<MLProduct[]> {
    try {
      console.log(`🔍 Buscando produtos do seller por SKU: "${sku}"`);
      
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        console.error('❌ Access token não disponível');
        return [];
      }

      const sellerId = await this.getSellerId();
      if (!sellerId) {
        console.error('❌ Seller ID não disponível');
        return [];
      }
      
      const response = await axios.get(`${ML_API_BASE}/users/${sellerId}/items/search`, {
        params: {
          seller_sku: sku
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const results = response.data?.results || [];
      console.log(`✅ Encontrados ${results.length} produtos do seller para SKU "${sku}"`);
      
      // Para cada item ID, busca detalhes completos
      const products: MLProduct[] = [];
      for (const itemId of results) {
        const details = await this.getItemDetails(itemId);
        if (details) {
          products.push({
            id: details.id,
            title: details.title,
            price: details.price,
            thumbnail: details.pictures?.[0]?.secure_url || details.pictures?.[0]?.url || '',
            permalink: details.permalink,
            category_id: details.category_id,
            condition: details.condition,
            seller: {
              id: sellerId,
              nickname: 'Seller Autenticado'
            }
          });
        }
      }
      
      return products;

    } catch (error: any) {
      console.error('❌ Erro ao buscar produtos do seller por SKU:', error.message);
      return [];
    }
  }

  /**
   * Busca produtos no Mercado Livre por termo (fallback público)
   * Usa endpoint público para busca geral quando SKU específico falha
   */
  async searchProducts(query: string, limit: number = 10): Promise<MLProduct[]> {
    try {
      console.log(`🔍 Buscando produtos no ML (público): "${query}"`);
      
      const response = await axios.get(`${ML_API_BASE}/sites/${SITE_ID}/search`, {
        params: {
          q: query,
          limit,
          condition: 'new',
          sort: 'relevance'
        },
        timeout: 10000
      });

      const results = response.data?.results || [];
      console.log(`✅ Encontrados ${results.length} produtos para "${query}"`);
      
      return results.map((item: any): MLProduct => ({
        id: item.id,
        title: item.title,
        price: item.price,
        thumbnail: item.thumbnail,
        permalink: item.permalink,
        category_id: item.category_id,
        condition: item.condition,
        seller: {
          id: item.seller?.id || 0,
          nickname: item.seller?.nickname || 'Desconhecido'
        }
      }));

    } catch (error: any) {
      console.error('❌ Erro ao buscar produtos no ML:', error.message);
      return [];
    }
  }

  /**
   * Busca detalhes completos de um produto específico por MLB code
   * Usa endpoint público mas com token quando disponível para melhor acesso
   */
  async getItemDetails(mlbCode: string): Promise<MLItemDetail | null> {
    try {
      console.log(`🔍 Buscando detalhes do item: ${mlbCode}`);
      
      const accessToken = await this.getAccessToken();
      const headers: any = {
        'Accept': 'application/json'
      };
      
      // Adiciona token de autorização se disponível para melhor acesso
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        console.log(`✅ Usando token de autorização para ${mlbCode}`);
      }
      
      const response = await axios.get(`${ML_API_BASE}/items/${mlbCode}`, {
        headers,
        timeout: 10000
      });

      const item = response.data;
      
      if (!item || !item.id) {
        console.warn(`⚠️ Item não encontrado: ${mlbCode}`);
        return null;
      }

      console.log(`✅ Detalhes obtidos para ${mlbCode}: ${item.title}`);
      
      return {
        id: item.id,
        title: item.title,
        price: item.price,
        pictures: item.pictures || [],
        permalink: item.permalink,
        category_id: item.category_id,
        condition: item.condition,
        status: item.status
      };

    } catch (error: any) {
      if (error.response?.status === 404) {
        console.warn(`⚠️ Item não encontrado: ${mlbCode}`);
      } else {
        console.error(`❌ Erro ao buscar detalhes do item ${mlbCode}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Valida se um código MLB existe e está ativo
   */
  async validateMLBCode(mlbCode: string): Promise<boolean> {
    const details = await this.getItemDetails(mlbCode);
    return details !== null && details.status === 'active';
  }

  /**
   * Busca o melhor match de MLB code para um SKU baseado em título
   * PRIORIZA busca autenticada do seller antes de busca pública
   */
  async findMLBForSKU(sku: string, productTitle?: string): Promise<string | null> {
    try {
      console.log(`🎯 Buscando MLB real para SKU: ${sku}${productTitle ? ` (${productTitle})` : ''}`);
      
      // PRIMEIRA PRIORIDADE: Busca autenticada por SKU exato
      console.log(`🔐 Tentando busca autenticada por SKU: ${sku}`);
      const sellerProducts = await this.searchProductsBySKU(sku);
      
      if (sellerProducts.length > 0) {
        const bestMatch = sellerProducts[0];
        console.log(`✅ MLB encontrado via busca autenticada para ${sku}: ${bestMatch.id} - "${bestMatch.title}"`);
        return bestMatch.id;
      }
      
      // SEGUNDA PRIORIDADE: Busca pública por termos
      console.log(`🌐 Fallback para busca pública por termos...`);
      const searchTerms = [
        productTitle, // Título completo do produto
        `${sku} ${productTitle}`, // SKU + título
        sku, // Apenas SKU
        productTitle?.split(' ').slice(0, 3).join(' ') // Primeiras 3 palavras do título
      ].filter(term => term && term.trim().length > 0);

      for (const term of searchTerms) {
        if (!term) continue;
        
        const products = await this.searchProducts(term, 5);
        
        if (products.length > 0) {
          // Pega o primeiro resultado mais relevante
          const bestMatch = products[0];
          
          // Valida se o código MLB está ativo
          const isValid = await this.validateMLBCode(bestMatch.id);
          
          if (isValid) {
            console.log(`✅ MLB encontrado via busca pública para ${sku}: ${bestMatch.id} - "${bestMatch.title}"`);
            return bestMatch.id;
          }
        }
      }

      console.warn(`⚠️ Nenhum MLB real encontrado para SKU: ${sku}`);
      return null;

    } catch (error: any) {
      console.error(`❌ Erro ao buscar MLB para SKU ${sku}:`, error.message);
      return null;
    }
  }

  /**
   * Busca imagem de alta qualidade para um MLB code
   */
  async getHighQualityImage(mlbCode: string): Promise<string | null> {
    try {
      const details = await this.getItemDetails(mlbCode);
      
      if (!details || !details.pictures || details.pictures.length === 0) {
        return null;
      }

      // Pega a primeira imagem disponível (melhor qualidade)
      const firstPicture = details.pictures[0];
      
      // Prioriza secure_url, depois url normal
      return firstPicture.secure_url || firstPicture.url || null;

    } catch (error: any) {
      console.error(`❌ Erro ao buscar imagem para ${mlbCode}:`, error.message);
      return null;
    }
  }
}

export const mercadoLivreLookupService = new MercadoLivreLookupService();