import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

// --- INTERFACES ---

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
  prices: ProductPrice[];
}

export interface ProductInput {
  creatorId: string;
  title: string;
  type: string;
  prices: ProductPrice[];
  description?: string;
  contentUrl?: string;
  commissionPercent?: number;
  status?: string;
}

// --- REPOSITORIO ---

export const productRepository = {
  /**
   * Mapea una fila de la base de datos al objeto de dominio Product.
   * Garantiza que los tipos de datos sean correctos (ej. convertir strings de DB a Numbers).
   */
  mapRowToProduct(row: any): Product {
    return {
      id: row.id,
      creator_id: row.creator_id,
      title: row.title,
      description: row.description,
      type: row.type,
      content_url: row.content_url,
      affiliate_commission_percent: Number(row.affiliate_commission_percent),
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // prices ya viene como array JSON desde las consultas que usan json_agg
      prices: row.prices || [],
    };
  },

  /**
   * Crea un producto y sus múltiples precios en una sola transacción atómica.
   */
  async createProduct(input: ProductInput): Promise<Product> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Insertar en la tabla principal 'products'
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
        input.status || 'published',
      ]);

      const productRow = productRes.rows[0];

      // 2. Insertar los precios en la tabla relacionada 'product_prices'
      const priceQuery = `
        INSERT INTO "${schema}".product_prices (product_id, currency, amount)
        VALUES ($1, $2, $3);
      `;

      for (const p of input.prices) {
        await client.query(priceQuery, [productRow.id, p.currency, p.amount]);
      }

      await client.query('COMMIT');

      // Devolvemos el producto completo mapeado
      return this.mapRowToProduct({ ...productRow, prices: input.prices });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error(
        { error: error.message, input },
        'Error en transacción: Falló creación de producto'
      );
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Obtiene un producto por ID incluyendo su lista de precios mediante una subconsulta JSON.
   */
  async getProductById(id: string): Promise<Product | null> {
    try {
      const query = `
        SELECT p.*, 
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id) as prices
        FROM "${schema}".products p
        WHERE p.id = $1;
      `;
      const { rows } = await pool.query(query, [id]);

      if (!rows[0]) return null;

      return this.mapRowToProduct(rows[0]);
    } catch (error: any) {
      logger.error({ id, error: error.message }, 'Error DB: getProductById falló');
      throw error;
    }
  },

  /**
   * Lista los productos de un creador específico.
   */
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
      return rows.map(row => this.mapRowToProduct(row));
    } catch (error: any) {
      logger.error({ creatorId, error: error.message }, 'Error DB: getProductsByCreator falló');
      throw error;
    }
  },

  /**
   * Recupera el precio oficial para una moneda específica de un producto.
   * Utilizado críticamente en el flujo de pagos para evitar manipulaciones de precio desde el front.
   */
  async getPriceByCurrency(productId: string, currency: string): Promise<number | null> {
    const query = `
      SELECT amount 
      FROM "${schema}".product_prices 
      WHERE product_id = $1 AND currency = $2
    `;
    try {
      const { rows } = await pool.query(query, [productId, currency]);
      return rows[0] ? Number(rows[0].amount) : null;
    } catch (error: any) {
      logger.error(
        { productId, currency, error: error.message },
        'Error obteniendo precio específico'
      );
      throw error;
    }
  },
};
