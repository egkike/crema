import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

// Interfaces actualizadas
export interface ProductPrice {
  currency: string;
  amount: number;
}

export interface Product {
  id: string;
  creator_id: string;
  title: string;
  description?: string | null;
  type: string;
  content_url?: string | null;
  affiliate_commission_percent: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  prices?: ProductPrice[]; // Incluimos los precios en el retorno
}

export interface ProductInput {
  creatorId: string;
  title: string;
  type: string;
  prices: ProductPrice[];
  // Agregamos "| undefined" a todos los que pueden venir vacíos desde Zod
  description?: string | undefined;
  contentUrl?: string | undefined;
  commissionPercent?: number | undefined;
  status?: string | undefined;
}

export const productRepository = {
  mapRowToProduct(row: any): Product {
    return {
      ...row,
      affiliate_commission_percent: Number(row.affiliate_commission_percent),
    };
  },

  /**
   * Crea un producto y sus múltiples precios en una sola transacción
   */
  async createProduct(input: ProductInput): Promise<Product> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Insertar en la tabla principal 'products'
      // (Nota: Ya no enviamos price ni currency aquí)
      const productQuery = `
        INSERT INTO "${schema}".products (
          creator_id, title, description, type, content_url, 
          affiliate_commission_percent, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;

      const productRes = await client.query(productQuery, [
        input.creatorId,
        input.title,
        input.description || null,
        input.type,
        input.contentUrl || null,
        input.commissionPercent ?? 50.0,
        input.status || 'draft',
      ]);

      const newProduct = this.mapRowToProduct(productRes.rows[0]);

      // 2. Insertar los precios en 'product_prices'
      const priceQuery = `
        INSERT INTO "${schema}".product_prices (product_id, currency, amount)
        VALUES ($1, $2, $3);
      `;

      for (const p of input.prices) {
        await client.query(priceQuery, [newProduct.id, p.currency, p.amount]);
      }

      await client.query('COMMIT');

      return { ...newProduct, prices: input.prices };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, input }, 'DB Transaction Error: Create product failed');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Obtiene un producto incluyendo su lista de precios
   */
  async getProductById(id: string): Promise<Product | null> {
    try {
      // Usamos un JOIN o una subconsulta para traer los precios
      const query = `
        SELECT p.*, 
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id) as prices
        FROM "${schema}".products p
        WHERE p.id = $1;
      `;
      const { rows } = await pool.query(query, [id]);

      if (!rows[0]) return null;

      const product = this.mapRowToProduct(rows[0]);
      return { ...product, prices: rows[0].prices || [] };
    } catch (error: any) {
      logger.error({ id, error: error.message }, 'DB Error: getProductById failed');
      throw error;
    }
  },

  async getProductsByCreator(creatorId: string): Promise<Product[]> {
    try {
      const query = `
        SELECT p.*, 
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id) as prices
        FROM "${schema}".products p
        WHERE p.creator_id = $1
        ORDER BY p.created_at DESC;
      `;
      const { rows } = await pool.query(query, [creatorId]);
      return rows.map(row => ({
        ...this.mapRowToProduct(row),
        prices: row.prices || [],
      }));
    } catch (error: any) {
      logger.error({ creatorId, error: error.message }, 'DB Error: getProductsByCreator failed');
      throw error;
    }
  },

  async getPriceByCurrency(productId: string, currency: string): Promise<number | null> {
    const query = `
    SELECT amount 
    FROM "${schema}".product_prices 
    WHERE product_id = $1 AND currency = $2
  `;
    try {
      const { rows } = await pool.query(query, [productId, currency]);
      return rows[0] ? Number(rows[0].amount) : null;
    } catch (error) {
      logger.error({ productId, currency, error }, 'Error obteniendo precio específico');
      throw error;
    }
  },
};
