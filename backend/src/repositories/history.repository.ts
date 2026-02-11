import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

// 1. Añadimos 'payout_refund' para soportar devoluciones de retiros fallidos
export type HistoryType =
  | 'sale_creator'
  | 'sale_affiliate'
  | 'refund'
  | 'payout_request'
  | 'payout_refund'
  | 'balance_release';

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
  mapRow(row: any): BalanceHistoryRecord {
    return {
      ...row,
      amount: Number(row.amount),
    };
  },

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
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".balance_history (user_id, order_id, amount, currency, type, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    try {
      const { rows } = await client.query(query, [
        data.userId,
        data.order_id,
        data.amount,
        data.currency,
        data.type,
        data.description,
      ]);
      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error(
        { error: error.message, userId: data.userId },
        'DB Error: createRecordWithClient history failed'
      );
      throw error;
    }
  },

  /**
   * Obtiene el historial con conteo total para paginación en el frontend
   */
  async getByUserIdWithCount(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    currency?: string
  ) {
    const schema = config.db?.schema || 'public';
    let whereClause = `WHERE user_id = $1`;
    const params: any[] = [userId];

    if (currency) {
      params.push(currency);
      whereClause += ` AND currency = $${params.length}`;
    }

    const dataQuery = `
      SELECT * FROM "${schema}".balance_history 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countQuery = `SELECT COUNT(*) FROM "${schema}".balance_history ${whereClause}`;

    try {
      const [dataRes, countRes] = await Promise.all([
        pool.query(dataQuery, [...params, limit, offset]),
        pool.query(countQuery, params),
      ]);

      return {
        data: dataRes.rows.map(row => this.mapRow(row)),
        total: parseInt(countRes.rows[0].count, 10),
      };
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'DB Error: getByUserIdWithCount failed');
      throw error;
    }
  },
};
