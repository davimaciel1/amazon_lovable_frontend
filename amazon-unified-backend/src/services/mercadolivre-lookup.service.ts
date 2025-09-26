/**
 * Serviço para buscar códigos MLB reais da API do Mercado Livre
 * Substitui códigos MLB inventados por códigos reais verificados
 */

import axios from 'axios';

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
  private accessToken: string;

  constructor() {
    this.accessToken = process.env.ML_ACCESS_TOKEN || '';
    if (!this.accessToken) {
      console.warn('⚠️ ML_ACCESS_TOKEN não encontrado. Funcionalidades limitadas.');
    }
  }

  /**
   * Busca produtos no Mercado Livre por termo (título, SKU, etc)
   */
  async searchProducts(query: string, limit: number = 10): Promise<MLProduct[]> {
    try {
      console.log(`🔍 Buscando produtos no ML: "${query}"`);
      
      const response = await axios.get(`${ML_API_BASE}/sites/${SITE_ID}/search`, {
        params: {
          q: query,
          limit,
          condition: 'new', // Apenas produtos novos
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
   */
  async getItemDetails(mlbCode: string): Promise<MLItemDetail | null> {
    try {
      console.log(`🔍 Buscando detalhes do item: ${mlbCode}`);
      
      const response = await axios.get(`${ML_API_BASE}/items/${mlbCode}`, {
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
   * Retorna o código MLB mais relevante encontrado
   */
  async findMLBForSKU(sku: string, productTitle?: string): Promise<string | null> {
    try {
      console.log(`🎯 Buscando MLB real para SKU: ${sku}${productTitle ? ` (${productTitle})` : ''}`);
      
      // Estratégias de busca em ordem de prioridade
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
            console.log(`✅ MLB real encontrado para ${sku}: ${bestMatch.id} - "${bestMatch.title}"`);
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