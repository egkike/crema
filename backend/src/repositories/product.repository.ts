// src/repositories/product.repository.ts
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
  async createProduct(input: ProductInput): Promise<Product | { error: string }> {
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

    try {
      const query = `
        INSERT INTO "${schema}".products (
          creator_id, title, description, type, price, content_url, 
          affiliate_commission_percent, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, creator_id, title, description, type, price, content_url, 
                  affiliate_commission_percent, status, created_at, updated_at
      `;
      const values = [
        creatorId,
        title,
        description || null,
        type,
        price,
        contentUrl || null,
        commissionPercent,
        status,
      ];

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return { error: 'No se pudo crear el producto' };
      }

      return result.rows[0] as Product;
    } catch (error: any) {
      logger.error(
        { message: error.message, code: error.code, detail: error.detail, input },
        'Error al crear producto'
      );
      return { error: 'Error interno al crear producto' };
    }
  },

  async getProductById(id: string): Promise<Product | { error: string }> {
    try {
      const result = await pool.query(
        `SELECT id, creator_id, title, description, type, price, content_url, 
                affiliate_commission_percent, status, created_at, updated_at
         FROM "${schema}".products WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return { error: 'Producto no encontrado' };
      }

      return result.rows[0] as Product;
    } catch (error: any) {
      logger.error({ id, error: error.message }, 'Error al obtener producto por ID');
      return { error: 'Error interno al buscar producto' };
    }
  },

  async getProductsByCreator(creatorId: string): Promise<Product[] | { error: string }> {
    try {
      const result = await pool.query(
        `SELECT id, creator_id, title, description, type, price, content_url, 
                affiliate_commission_percent, status, created_at, updated_at
         FROM "${schema}".products
         WHERE creator_id = $1
         ORDER BY created_at DESC`,
        [creatorId]
      );

      return result.rows as Product[];
    } catch (error: any) {
      logger.error({ creatorId, error: error.message }, 'Error al listar productos del creador');
      return { error: 'Error interno al listar productos' };
    }
  },
};
