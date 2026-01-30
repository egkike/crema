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
  contentUrl?: string;
  commissionPercent?: number;
  status?: string;
}

export const productRepository = {
  async createProduct(input: ProductInput): Promise<Product> {
    const {
      creatorId,
      title,
      description,
      type,
      price,
      contentUrl,
      commissionPercent = 50.0,
      status = 'draft',
    } = input;

    const query = `
      INSERT INTO "${schema}".products (
        creator_id, title, description, type, price, content_url, 
        affiliate_commission_percent, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    try {
      const { rows } = await pool.query(query, [
        creatorId,
        title,
        description || null,
        type,
        price,
        contentUrl || null,
        commissionPercent,
        status,
      ]);
      return rows[0];
    } catch (error: any) {
      logger.error({ error: error.message, input }, 'DB Error: Create product failed');
      throw error; // El Service lo atrapará y lanzará AppError
    }
  },

  async getProductById(id: string): Promise<Product | null> {
    try {
      const { rows } = await pool.query(`SELECT * FROM "${schema}".products WHERE id = $1`, [id]);
      return rows[0] || null; // Retornamos null si no existe
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
      return rows;
    } catch (error: any) {
      logger.error({ creatorId, error: error.message }, 'DB Error: getProductsByCreator failed');
      throw error;
    }
  },
};
