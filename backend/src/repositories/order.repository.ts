import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

// Ajustamos el DTO para que use camelCase en el código (más estándar en TS)
// y coincida con lo que el Controller enviará.
export interface CreateOrderDTO {
  buyerId: string;
  productId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  externalReference: string;
  status?: string;
  affiliateId?: string | null;
  commissionAmount?: number;
}

export const orderRepository = {
  mapRowToOrder(row: any) {
    if (!row) return null;
    return {
      ...row,
      amount: Number(row.amount),
      commission_amount: row.commission_amount ? Number(row.commission_amount) : 0,
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
      data.buyerId,
      data.productId,
      data.affiliateId || null,
      data.amount,
      data.currency,
      data.commissionAmount || 0,
      data.status || 'pending',
      data.paymentMethod,
      data.externalReference,
    ];

    try {
      const { rows } = await pool.query(query, values);
      return this.mapRowToOrder(rows[0]);
    } catch (error: any) {
      logger.error(
        { error: error.message, ref: data.externalReference },
        'DB Error: Insert order failed'
      );
      throw error;
    }
  },

  /**
   * ✅ ACTUALIZACIÓN: Ahora también verificamos que el usuario pueda acceder
   * si es el CREADOR del producto, no solo si lo compró.
   */
  async checkAccess(userId: string, productId: string): Promise<boolean> {
    const query = `
      SELECT o.id FROM "${schema}".orders o
      WHERE o.buyer_id = $1 AND o.product_id = $2 AND o.status = 'paid'
      UNION
      SELECT p.id FROM "${schema}".products p
      WHERE p.creator_id = $1 AND p.id = $2
      LIMIT 1;
    `;
    try {
      const { rows } = await pool.query(query, [userId, productId]);
      return rows.length > 0;
    } catch (error: any) {
      logger.error({ error: error.message, userId, productId }, 'DB Error: checkAccess failed');
      throw error;
    }
  },

  // ... (los métodos updateByExternalRef y getByExternalRef se mantienen igual)
  async updateByExternalRef(externalRef: string, updates: any) {
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
  },

  async getByExternalRef(externalRef: string) {
    const { rows } = await pool.query(
      `SELECT * FROM "${schema}".orders WHERE external_reference = $1`,
      [externalRef]
    );
    return this.mapRowToOrder(rows[0]);
  },
};
