/**
 * Rotas para gerenciar mapeamentos reais SKU → MLB Code
 * Substitui códigos MLB inventados por códigos reais do Mercado Livre
 */

import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { mercadoLivreLookupService } from '../services/mercadolivre-lookup.service';

export function createMLRealMappingsRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/ml-real-mappings - Lista todos os mapeamentos
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT * FROM ml_real_mappings 
        ORDER BY created_at DESC
      `);
      
      res.json({
        success: true,
        mappings: result.rows,
        count: result.rows.length
      });
      
    } catch (error) {
      console.error('❌ Erro ao listar mapeamentos MLB:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * POST /api/ml-real-mappings/search - Busca MLB real para um SKU
   */
  router.post('/search', async (req: Request, res: Response) => {
    try {
      const { sku, title } = req.body;
      
      if (!sku) {
        res.status(400).json({
          success: false,
          error: 'SKU é obrigatório'
        });
        return;
      }

      console.log(`🔍 Buscando MLB real para SKU: ${sku}`);
      
      // Busca o código MLB real
      const mlbCode = await mercadoLivreLookupService.findMLBForSKU(sku, title);
      
      if (!mlbCode) {
        res.status(404).json({
          success: false,
          error: `Nenhum código MLB real encontrado para SKU: ${sku}`,
          sku
        });
        return;
      }

      // Busca detalhes completos
      const details = await mercadoLivreLookupService.getItemDetails(mlbCode);
      const imageUrl = await mercadoLivreLookupService.getHighQualityImage(mlbCode);
      
      res.json({
        success: true,
        sku,
        mlb_code: mlbCode,
        details: {
          title: details?.title,
          price: details?.price,
          image_url: imageUrl,
          permalink: details?.permalink,
          status: details?.status
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar MLB real:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * POST /api/ml-real-mappings/save - Salva mapeamento SKU → MLB real
   */
  router.post('/save', async (req: Request, res: Response) => {
    try {
      const { sku, mlb_code, title, price, image_url, permalink } = req.body;
      
      if (!sku || !mlb_code) {
        res.status(400).json({
          success: false,
          error: 'SKU e MLB code são obrigatórios'
        });
        return;
      }

      // Valida se o código MLB existe
      const isValid = await mercadoLivreLookupService.validateMLBCode(mlb_code);
      if (!isValid) {
        res.status(400).json({
          success: false,
          error: `Código MLB inválido: ${mlb_code}`
        });
        return;
      }

      // Salva ou atualiza na tabela
      const result = await pool.query(`
        INSERT INTO ml_real_mappings (sku, mlb_code, title, price, image_url, permalink, verified_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (sku) 
        DO UPDATE SET 
          mlb_code = $2, 
          title = $3, 
          price = $4, 
          image_url = $5, 
          permalink = $6,
          verified_at = NOW(),
          updated_at = NOW()
        RETURNING *
      `, [sku, mlb_code, title, price, image_url, permalink]);
      
      console.log(`✅ Mapeamento salvo: ${sku} → ${mlb_code}`);
      
      res.json({
        success: true,
        message: 'Mapeamento salvo com sucesso',
        mapping: result.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao salvar mapeamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * POST /api/ml-real-mappings/backfill - Faz backfill de todos os SKUs conhecidos
   */
  router.post('/backfill', async (_req: Request, res: Response) => {
    try {
      console.log('🚀 Iniciando backfill de códigos MLB reais...');
      
      // Lista de SKUs conhecidos com seus títulos
      const knownProducts = [
        { sku: 'IPAS01', title: 'Arame Solda Mig Sem Gás Tubular 0.8mm 1kg' },
        { sku: 'IPAS02', title: 'Eletrodo 6013 2.5mm 5kg' },
        { sku: 'IPAS03', title: 'Eletrodo Solda 6013 3.25mm 5kg' },
        { sku: 'IPAS04', title: 'Arame Solda Mig Tubular Uso Sem Gás 0.8mm' },
        { sku: 'IPP-PV-01', title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada' },
        { sku: 'IPP-PV-02', title: 'Piso Vinílico Autocolante Caixa 1,25m2 Régua Amadeirada' }
      ];

      const results = [];
      
      for (const product of knownProducts) {
        try {
          console.log(`🔍 Processando ${product.sku}...`);
          
          // Busca código MLB real
          const mlbCode = await mercadoLivreLookupService.findMLBForSKU(product.sku, product.title);
          
          if (mlbCode) {
            // Busca detalhes
            const details = await mercadoLivreLookupService.getItemDetails(mlbCode);
            const imageUrl = await mercadoLivreLookupService.getHighQualityImage(mlbCode);
            
            // Salva no banco
            await pool.query(`
              INSERT INTO ml_real_mappings (sku, mlb_code, title, price, image_url, permalink, verified_at)
              VALUES ($1, $2, $3, $4, $5, $6, NOW())
              ON CONFLICT (sku) 
              DO UPDATE SET 
                mlb_code = $2, 
                title = $3, 
                price = $4, 
                image_url = $5, 
                permalink = $6,
                verified_at = NOW(),
                updated_at = NOW()
            `, [product.sku, mlbCode, details?.title, details?.price, imageUrl, details?.permalink]);
            
            results.push({
              sku: product.sku,
              mlb_code: mlbCode,
              status: 'success',
              title: details?.title
            });
            
            console.log(`✅ ${product.sku} → ${mlbCode}`);
          } else {
            results.push({
              sku: product.sku,
              status: 'not_found'
            });
            
            console.warn(`⚠️ ${product.sku} → MLB não encontrado`);
          }
          
          // Delay entre requests para evitar rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`❌ Erro ao processar ${product.sku}:`, error);
          results.push({
            sku: product.sku,
            status: 'error',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
          });
        }
      }
      
      console.log('✅ Backfill concluído!');
      
      res.json({
        success: true,
        message: 'Backfill concluído',
        results,
        summary: {
          total: results.length,
          success: results.filter(r => r.status === 'success').length,
          not_found: results.filter(r => r.status === 'not_found').length,
          errors: results.filter(r => r.status === 'error').length
        }
      });
      
    } catch (error) {
      console.error('❌ Erro no backfill:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * GET /api/ml-real-mappings/:sku - Busca mapeamento específico
   */
  router.get('/:sku', async (req: Request, res: Response) => {
    try {
      const { sku } = req.params;
      
      const result = await pool.query(`
        SELECT * FROM ml_real_mappings 
        WHERE sku = $1
      `, [sku]);
      
      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: `Mapeamento não encontrado para SKU: ${sku}`
        });
        return;
      }
      
      res.json({
        success: true,
        mapping: result.rows[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar mapeamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
}