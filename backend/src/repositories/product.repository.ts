import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export interface Product {
  id: string;
  creator_id: string;
  title: string;
  description?: string | null;
  type: string;
  price: number;
  currency: string; // <-- Añadido
  content_url?: string | null;
  affiliate_commission_percent: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProductInput {
  creatorId: string;
  title: string;
  description?: string;
  type: string;
  price: number;
  currency?: string; // <-- Añadido opcional
  contentUrl?: string;
  commissionPercent?: number;
  status?: string;
}

export const productRepository = {
  /**
   * Helper para formatear las filas de la DB a la interfaz Product
   */
  mapRowToProduct(row: any): Product {
    return {
      ...row,
      price: Number(row.price),
      affiliate_commission_percent: Number(row.affiliate_commission_percent),
    };
  },

  async createProduct(input: ProductInput): Promise<Product> {
    const {
      creatorId,
      title,
      description,
      type,
      price,
      currency = 'ARS', // Default de tu sistema actual
      contentUrl,
      commissionPercent = 50.0,
      status = 'draft',
    } = input;

    const query = `
      INSERT INTO "${schema}".products (
        creator_id, title, description, type, price, currency, content_url, 
        affiliate_commission_percent, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    try {
      const { rows } = await pool.query(query, [
        creatorId,
        title,
        description || null,
        type,
        price,
        currency, // Nuevo valor inyectado
        contentUrl || null,
        commissionPercent,
        status,
      ]);
      return this.mapRowToProduct(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, input }, 'DB Error: Create product failed');
      throw error;
    }
  },

  async getProductById(id: string): Promise<Product | null> {
    try {
      const { rows } = await pool.query(`SELECT * FROM "${schema}".products WHERE id = $1`, [id]);
      return rows[0] ? this.mapRowToProduct(rows[0]) : null;
    } catch (error: any) {
      logger.error({ id, error: error.message }, 'DB Error: getProductById failed');
      throw error;
    }
  },

  async getProductsByCreator(creatorId: string): Promise<Product[]> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "${schema}".products WHERE creator_id = $1 ORDER BY created_at DESC`,
        [creatorId]
      );
      return rows.map(row => this.mapRowToProduct(row));
    } catch (error: any) {
      logger.error({ creatorId, error: error.message }, 'DB Error: getProductsByCreator failed');
      throw error;
    }
  },
};
