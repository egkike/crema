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
  async updateByExternalRef(
    externalReference: string,
    data: Partial<any>,
    client?: any // <--- Agregamos el cliente opcional
  ) {
    const fields = Object.keys(data)
      .map((key, i) => `"${key}" = $${i + 1}`)
      .join(', ');

    const values = Object.values(data);
    const query = `
      UPDATE "${schema}".orders 
      SET ${fields}, updated_at = CURRENT_TIMESTAMP 
      WHERE external_reference = $${values.length + 1} 
      RETURNING *;
    `;

    // Si viene un client, lo usamos; si no, usamos el pool global
    const db = client || pool;
    const { rows } = await db.query(query, [...values, externalReference]);
    return rows[0];
  },

  async getByExternalRef(externalRef: string) {
    const { rows } = await pool.query(
      `SELECT * FROM "${schema}".orders WHERE external_reference = $1`,
      [externalRef]
    );
    return this.mapRowToOrder(rows[0]);
  },

  /**
   * Obtiene una orden por ID haciendo JOIN con productos para obtener el vendedor
   */
  async getById(orderId: string, client?: any) {
    // Agregamos "${schema}" para mantener la consistencia del proyecto
    const query = `
      SELECT 
        o.*, 
        p.creator_id as seller_id 
      FROM "${schema}".orders o
      INNER JOIN "${schema}".products p ON o.product_id = p.id
      WHERE o.id = $1
    `;

    try {
      const db = client || pool;
      const { rows } = await db.query(query, [orderId]);

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        ...row,
        total_amount: Number(row.amount),
        currency: row.currency,
        seller_id: row.seller_id,
        status: row.status,
      };
    } catch (error: any) {
      logger.error({ error: error.message, orderId }, 'DB Error: getById failed');
      throw error;
    }
  },

  /**
   * Actualiza el estado de la orden
   */
  async updateStatus(orderId: string, status: string, client?: any) {
    const query = `
      UPDATE "${schema}".orders 
      SET status = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 
      RETURNING *;
    `;
    const db = client || pool;
    const { rows } = await db.query(query, [status, orderId]);
    return rows[0];
  },
};
