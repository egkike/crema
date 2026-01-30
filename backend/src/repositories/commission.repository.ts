import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export interface CreateCommissionDTO {
  affiliate_id: string;
  order_id: string;
  amount: number;
  currency: string; // <-- Añadido para trazabilidad
  status?: string;
}

export const commissionRepository = {
  /**
   * Helper para formatear decimales de la DB
   */
  mapRowToCommission(row: any) {
    if (!row) return null;
    return {
      ...row,
      amount: Number(row.amount),
    };
  },

  /**
   * Crea una comisión dentro o fuera de una transacción.
   */
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
      data.currency, // <-- Nuevo valor
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
   * Obtiene comisiones por ID de orden
   */
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
};
