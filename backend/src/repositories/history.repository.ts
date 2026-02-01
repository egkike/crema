import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

const schema = config.db.schema;

export type HistoryType = 'sale_creator' | 'sale_affiliate' | 'refund' | 'payout_request';

export interface BalanceHistoryRecord {
  id: string;
  user_id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  type: HistoryType;
  description: string;
  created_at: Date;
}

export const historyRepository = {
  /**
   * Helper para mapear y asegurar tipos numéricos
   */
  mapRow(row: any): BalanceHistoryRecord {
    return {
      ...row,
      amount: Number(row.amount),
    };
  },

  /**
   * Crea un registro histórico dentro de una transacción.
   * Obligatorio pasar el 'client' para asegurar atomicidad con el balance.
   */
  async createRecordWithClient(
    client: any,
    data: {
      userId: string;
      order_id: string | null;
      amount: number;
      currency: string;
      type: HistoryType;
      description: string;
    }
  ): Promise<BalanceHistoryRecord> {
    const query = `
      INSERT INTO "${schema}".balance_history (user_id, order_id, amount, currency, type, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    try {
      const values = [
        data.userId,
        data.order_id,
        data.amount,
        data.currency,
        data.type,
        data.description,
      ];

      const { rows } = await client.query(query, values);
      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error(
        { error: error.message, userId: data.userId, orderId: data.order_id },
        'DB Error: createRecordWithClient history failed'
      );
      throw error;
    }
  },

  /**
   * Obtiene el historial de un usuario con filtros opcionales.
   * Ideal para el panel de "Mis Movimientos".
   */
  async getByUserId(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    currency?: string
  ): Promise<BalanceHistoryRecord[]> {
    let query = `
      SELECT * FROM "${schema}".balance_history 
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (currency) {
      params.push(currency);
      query += ` AND currency = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    try {
      const { rows } = await pool.query(query, params);
      return rows.map(row => this.mapRow(row));
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'DB Error: getByUserId history failed');
      throw error;
    }
  },
};
