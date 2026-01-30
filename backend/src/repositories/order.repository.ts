import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export interface CreateOrderDTO {
  buyer_id: string;
  product_id: string;
  amount: number;
  currency: string; // <-- Añadido: Obligatorio para integridad financiera
  payment_method: string;
  external_reference: string;
  status?: string;
  affiliate_id?: string | null;
  commission_amount?: number;
}

export const orderRepository = {
  /**
   * Helper para formatear montos de la DB
   */
  mapRowToOrder(row: any) {
    if (!row) return null;
    return {
      ...row,
      amount: Number(row.amount),
      commission_amount: Number(row.commission_amount),
    };
  },

  async create(data: CreateOrderDTO) {
    const query = `
      INSERT INTO "${schema}".orders (
        buyer_id, product_id, affiliate_id, amount, currency,
        commission_amount, status, payment_method, external_reference
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const values = [
      data.buyer_id,
      data.product_id,
      data.affiliate_id || null,
      data.amount,
      data.currency, // <-- Inyectamos la moneda
      data.commission_amount || 0,
      data.status || 'pending',
      data.payment_method,
      data.external_reference,
    ];

    try {
      const { rows } = await pool.query(query, values);
      return this.mapRowToOrder(rows[0]);
    } catch (error: any) {
      logger.error(
        { error: error.message, ref: data.external_reference },
        'DB Error: Insert order failed'
      );
      throw error;
    }
  },

  async updateByExternalRef(externalRef: string, updates: any) {
    try {
      const query = `
        UPDATE "${schema}".orders 
        SET status = $1, transaction_id = $2, gateway_status = $3, updated_at = CURRENT_TIMESTAMP
        WHERE external_reference = $4
        RETURNING *;
      `;
      const { rows } = await pool.query(query, [
        updates.status,
        updates.transaction_id,
        updates.gateway_status || null,
        externalRef,
      ]);
      return this.mapRowToOrder(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, externalRef }, 'DB Error: Update order failed');
      throw error;
    }
  },

  async getByExternalRef(externalRef: string) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "${schema}".orders WHERE external_reference = $1`,
        [externalRef]
      );
      return this.mapRowToOrder(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, externalRef }, 'DB Error: Fetch order by ref failed');
      throw error;
    }
  },

  async getById(id: string) {
    try {
      const { rows } = await pool.query(`SELECT * FROM "${schema}".orders WHERE id = $1`, [id]);
      return this.mapRowToOrder(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, id }, 'DB Error: Fetch order by ID failed');
      throw error;
    }
  },

  async checkPaidOrder(userId: string, productId: string): Promise<boolean> {
    const query = `
      SELECT id FROM "${schema}".orders 
      WHERE buyer_id = $1 AND product_id = $2 AND status = 'paid'
      LIMIT 1;
    `;
    try {
      const { rows } = await pool.query(query, [userId, productId]);
      return rows.length > 0;
    } catch (error: any) {
      logger.error({ error: error.message, userId, productId }, 'DB Error: checkPaidOrder failed');
      throw error;
    }
  },
};
