import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

export const affiliateRepository = {
  /**
   * Vincula a un afiliado con un producto
   */
  async addToPortfolio(affiliateId: string, productId: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".affiliate_portfolio (affiliate_id, product_id)
      VALUES ($1, $2)
      ON CONFLICT (affiliate_id, product_id) DO NOTHING;
    `;
    try {
      await pool.query(query, [affiliateId, productId]);
      return true;
    } catch (error: any) {
      logger.error(
        { error: error.message, affiliateId, productId },
        'DB Error: addToPortfolio failed'
      );
      throw error;
    }
  },

  /**
   * Elimina un producto del portfolio del afiliado
   */
  async removeFromPortfolio(affiliateId: string, productId: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    const query = `
      DELETE FROM "${schema}".affiliate_portfolio 
      WHERE affiliate_id = $1 AND product_id = $2;
    `;
    try {
      const result = await pool.query(query, [affiliateId, productId]);
      return result.rowCount ? result.rowCount > 0 : false;
    } catch (error: any) {
      logger.error(
        { error: error.message, affiliateId, productId },
        'DB Error: removeFromPortfolio failed'
      );
      throw error;
    }
  },

  /**
   * Verifica si existe la relación de afiliación
   */
  async isAffiliated(affiliateId: string, productId: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 1 FROM "${schema}".affiliate_portfolio 
      WHERE affiliate_id = $1 AND product_id = $2;
    `;
    try {
      const { rows } = await pool.query(query, [affiliateId, productId]);
      return rows.length > 0;
    } catch (error: any) {
      logger.error(
        { error: error.message, affiliateId, productId },
        'DB Error: isAffiliated failed'
      );
      return false;
    }
  },

  /**
   * Obtiene los IDs de los productos en el portfolio de un afiliado
   */
  async getPortfolioProductIds(affiliateId: string): Promise<string[]> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT product_id FROM "${schema}".affiliate_portfolio WHERE affiliate_id = $1;`;
    try {
      const { rows } = await pool.query(query, [affiliateId]);
      return rows.map(r => r.product_id);
    } catch (error: any) {
      logger.error(
        { error: error.message, affiliateId },
        'DB Error: getPortfolioProductIds failed'
      );
      return [];
    }
  },
};
