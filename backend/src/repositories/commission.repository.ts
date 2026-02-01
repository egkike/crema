import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export interface CreateCommissionDTO {
  affiliate_id: string;
  order_id: string;
  amount: number;
  currency: string;
  status?: string;
}

export const commissionRepository = {
  mapRowToCommission(row: any) {
    if (!row) return null;
    return {
      ...row,
      amount: Number(row.amount),
    };
  },

  async create(data: CreateCommissionDTO, client?: any) {
    const query = `
      INSERT INTO "${schema}".commissions (
        affiliate_id, order_id, amount, currency, status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [
      data.affiliate_id,
      data.order_id,
      data.amount,
      data.currency,
      data.status || 'pending',
    ];

    try {
      const db = client || pool;
      const { rows } = await db.query(query, values);
      return this.mapRowToCommission(rows[0]);
    } catch (error: any) {
      logger.error(
        { error: error.message, order_id: data.order_id },
        'DB Error: Create commission failed'
      );
      throw error;
    }
  },

  /**
   * Actualiza el estado de todas las comisiones de una orden.
   * Útil para reembolsos masivos o liberaciones.
   */
  async updateStatusByOrder(orderId: string, newStatus: string, client?: any) {
    const query = `
      UPDATE "${schema}".commissions 
      SET status = $1, paid_at = CASE WHEN $1 = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END
      WHERE order_id = $2
      RETURNING *;
    `;
    try {
      const db = client || pool;
      const { rows } = await db.query(query, [newStatus, orderId]);
      return rows.map(row => this.mapRowToCommission(row));
    } catch (error: any) {
      logger.error({ error: error.message, orderId }, 'DB Error: updateStatusByOrder failed');
      throw error;
    }
  },

  async getByOrderId(orderId: string) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "${schema}".commissions WHERE order_id = $1`,
        [orderId]
      );
      return rows.map(row => this.mapRowToCommission(row));
    } catch (error: any) {
      logger.error({ error: error.message, orderId }, 'DB Error: getByOrderId failed');
      throw error;
    }
  },

  /**
   * Obtiene las comisiones de un afiliado (Panel de Usuario)
   */
  async getByAffiliateId(affiliateId: string) {
    try {
      const query = `
        SELECT c.*, o.external_reference 
        FROM "${schema}".commissions c
        JOIN "${schema}".orders o ON c.order_id = o.id
        WHERE c.affiliate_id = $1
        ORDER BY c.created_at DESC;
      `;
      const { rows } = await pool.query(query, [affiliateId]);
      return rows.map(row => this.mapRowToCommission(row));
    } catch (error: any) {
      logger.error({ error: error.message, affiliateId }, 'DB Error: getByAffiliateId failed');
      throw error;
    }
  },
};
