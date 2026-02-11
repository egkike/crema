import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

export interface RefundData {
  orderId: string;
  sellerId: string;
  buyerId: string;
  amount: number;
  currency: string;
  reason: string;
}

export const refundRepository = {
  /**
   * Helper para formatear la salida de la DB
   */
  mapRow(row: any) {
    if (!row) return null;
    return {
      ...row,
      amount: Number(row.amount),
    };
  },

  /**
   * Crea un nuevo registro de reembolso.
   */
  async create(data: RefundData, client?: any) {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".refunds (
        order_id, 
        seller_id, 
        buyer_id, 
        amount, 
        currency, 
        reason
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const values = [
      data.orderId,
      data.sellerId,
      data.buyerId,
      data.amount,
      data.currency,
      data.reason,
    ];

    try {
      const db = client || pool;
      const { rows } = await db.query(query, values);
      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error(
        { error: error.message, orderId: data.orderId },
        'DB Error: refundRepository.create failed'
      );
      throw error;
    }
  },

  /**
   * Obtiene todos los reembolsos de una orden específica.
   */
  async getByOrderId(orderId: string) {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT * FROM "${schema}".refunds 
      WHERE order_id = $1
      ORDER BY created_at DESC;
    `;
    try {
      const { rows } = await pool.query(query, [orderId]);
      return rows.map(row => this.mapRow(row));
    } catch (error: any) {
      logger.error({ error: error.message, orderId }, 'DB Error: getByOrderId failed');
      throw error;
    }
  },
};
