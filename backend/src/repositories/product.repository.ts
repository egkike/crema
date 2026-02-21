import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

// --- INTERFACES ---

export interface ProductPrice {
  currency: string;
  amount: number;
}

export interface Product {
  id: string;
  slug: string;
  creator_id: string;
  title: string;
  description?: string | null;
  type: string;
  content_url?: string | null;
  affiliate_commission_percent: number;
  size_bytes: number;
  status: string;
  guarantee_days: number | null;
  created_at: Date;
  updated_at: Date;
  prices: ProductPrice[];
}

export interface ProductInput {
  creatorId: string;
  title: string;
  slug: string;
  type: string;
  prices: ProductPrice[];
  description?: string | undefined;
  contentUrl?: string | undefined;
  commissionPercent?: number | undefined;
  status?: string | undefined;
  sizeBytes?: number | undefined;
  guaranteeDays?: number | undefined;
}

// --- REPOSITORIO ---

export const productRepository = {
  mapRowToProduct(row: any): Product {
    return {
      id: row.id,
      slug: row.slug,
      creator_id: row.creator_id,
      title: row.title,
      description: row.description,
      type: row.type,
      content_url: row.content_url || row.contentUrl,
      affiliate_commission_percent: Number(row.affiliate_commission_percent),
      size_bytes: row.size_bytes ? Number(row.size_bytes) : 0,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      guarantee_days: row.guarantee_days !== undefined ? row.guarantee_days : null,
      prices: row.prices || [],
    };
  },

  async createProduct(input: ProductInput): Promise<Product> {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const productQuery = `
        INSERT INTO "${schema}".products (
          creator_id, title, slug, description, type, content_url, 
          affiliate_commission_percent, size_bytes, status, guarantee_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `;

      const productRes = await client.query(productQuery, [
        input.creatorId,
        input.title,
        input.slug,
        input.description ?? null,
        input.type,
        input.contentUrl ?? null,
        input.commissionPercent ?? 50.0,
        input.sizeBytes ?? 0,
        input.status ?? 'published',
        input.guaranteeDays ?? null,
      ]);

      const productRow = productRes.rows[0];

      if (input.prices && input.prices.length > 0) {
        const values: any[] = [];
        const valueRows: string[] = [];

        input.prices.forEach((p, index) => {
          const offset = index * 3;
          valueRows.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
          values.push(productRow.id, p.currency, p.amount);
        });

        const priceBulkQuery = `
          INSERT INTO "${schema}".product_prices (product_id, currency, amount)
          VALUES ${valueRows.join(', ')};
        `;
        await client.query(priceBulkQuery, values);
      }

      await client.query('COMMIT');
      return this.mapRowToProduct({ ...productRow, prices: input.prices });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, title: input.title }, 'Error creando producto');
      throw error;
    } finally {
      client.release();
    }
  },

  async getPublicProducts(): Promise<Product[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT p.*, 
             COALESCE(
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
               '[]'::json
             ) as prices
      FROM "${schema}".products p
      WHERE p.status = 'published'
      ORDER BY p.created_at DESC;
    `;
    const { rows } = await pool.query(query);
    return rows.map(row => this.mapRowToProduct(row));
  },

  async getProductByIdOrSlug(identifier: string): Promise<Product | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT p.*, 
             COALESCE(
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
               '[]'::json
             ) as prices
      FROM "${schema}".products p
      WHERE p.id::text = $1 OR p.slug = $1;
    `;
    const { rows } = await pool.query(query, [identifier]);
    return rows[0] ? this.mapRowToProduct(rows[0]) : null;
  },

  async getProductById(id: string): Promise<Product | null> {
    return this.getProductByIdOrSlug(id);
  },

  async getProductsByCreator(creatorId: string): Promise<Product[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT p.*, 
             COALESCE(
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
               '[]'::json
             ) as prices
      FROM "${schema}".products p
      WHERE p.creator_id = $1
      ORDER BY p.created_at DESC;
    `;
    const { rows } = await pool.query(query, [creatorId]);
    return rows.map(row => this.mapRowToProduct(row));
  },

  async getPriceByCurrency(productId: string, currency: string): Promise<number | null> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT amount FROM "${schema}".product_prices WHERE product_id = $1 AND currency = $2`;
    const { rows } = await pool.query(query, [productId, currency]);
    return rows[0] ? Number(rows[0].amount) : null;
  },

  async countProductsByCreator(userId: string): Promise<number> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT COUNT(*) FROM "${schema}".products WHERE creator_id = $1`;
    const { rows } = await pool.query(query, [userId]);
    return parseInt(rows[0].count, 10);
  },

  async updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Actualizar datos básicos
      const updateFields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      const fieldMap: Record<string, string> = {
        title: 'title',
        slug: 'slug',
        description: 'description',
        type: 'type',
        contentUrl: 'content_url',
        commissionPercent: 'affiliate_commission_percent',
        sizeBytes: 'size_bytes',
        status: 'status',
        guaranteeDays: 'guarantee_days',
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (input[key as keyof ProductInput] !== undefined) {
          updateFields.push(`${dbField} = $${idx}`);
          values.push(input[key as keyof ProductInput]);
          idx++;
        }
      }

      if (updateFields.length > 0) {
        values.push(id);
        const productUpdateQuery = `
          UPDATE "${schema}".products 
          SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = $${idx} RETURNING *;
        `;
        await client.query(productUpdateQuery, values);
      }

      // 2. Actualizar precios (si se proporcionan)
      if (input.prices) {
        await client.query(`DELETE FROM "${schema}".product_prices WHERE product_id = $1`, [id]);

        for (const p of input.prices) {
          await client.query(
            `INSERT INTO "${schema}".product_prices (product_id, currency, amount) VALUES ($1, $2, $3)`,
            [id, p.currency, p.amount]
          );
        }
      }

      await client.query('COMMIT');

      const updatedProduct = await this.getProductById(id);
      if (!updatedProduct) throw new Error('Error al recuperar el producto actualizado');
      return updatedProduct;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, productId: id }, 'Error actualizando producto');
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteProduct(id: string): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    // Borramos el producto (los precios se borran solos si hay CASCADE,
    // sino, habría que borrarlos manualmente en una transacción)
    const query = `DELETE FROM "${schema}".products WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async getAvailableForAffiliate(affiliateId: string): Promise<Product[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT p.*, 
             COALESCE(
               (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
                FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
               '[]'::json
             ) as prices
      FROM "${schema}".products p
      WHERE p.status = 'published'
      AND p.creator_id != $1
      -- Filtro: El producto debe tener al menos una moneda que el afiliado tenga configurada
      AND EXISTS (
          SELECT 1 FROM "${schema}".product_prices pp
          WHERE pp.product_id = p.id
          AND pp.currency IN (
              SELECT currency FROM "${schema}".user_payout_methods 
              WHERE user_id = $1
          )
      )
      ORDER BY p.created_at DESC;
    `;
    const { rows } = await pool.query(query, [affiliateId]);
    return rows.map(row => this.mapRowToProduct(row));
  },

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    if (!ids || ids.length === 0) return [];

    const schema = config.db?.schema || 'public';
    const query = `
    SELECT p.*, 
           COALESCE(
             (SELECT json_agg(json_build_object('currency', pp.currency, 'amount', pp.amount))
              FROM "${schema}".product_prices pp WHERE pp.product_id = p.id),
             '[]'::json
           ) as prices
    FROM "${schema}".products p
    WHERE p.id = ANY($1)
    ORDER BY p.created_at DESC;
  `;

    try {
      const { rows } = await pool.query(query, [ids]);
      return rows.map(row => this.mapRowToProduct(row));
    } catch (error: any) {
      logger.error({ error: error.message, ids }, 'Error obteniendo productos por lista de IDs');
      throw error;
    }
  },
};
