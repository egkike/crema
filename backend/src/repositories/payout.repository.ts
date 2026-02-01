import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const payoutRepository = {
  /**
   * Helper para asegurar que los montos sean numéricos
   */
  mapRow(row: any) {
    if (!row) return null;
    return {
      ...row,
      amount: Number(row.amount),
    };
  },

  /**
   * Crea una solicitud de retiro.
   * Siempre requiere un 'client' porque esto DEBE ocurrir dentro de una transacción
   * que descuente el saldo del usuario simultáneamente.
   */
  async create(
    data: { userId: string; amount: number; currency: string; destination: string },
    client: any
  ) {
    const query = `
      INSERT INTO "${schema}".payouts (user_id, amount, currency, destination_account)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    try {
      const { rows } = await client.query(query, [
        data.userId,
        data.amount,
        data.currency,
        data.destination,
      ]);
      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, userId: data.userId }, 'DB Error: Create payout failed');
      throw error;
    }
  },

  /**
   * Actualiza el estado de un payout (Aprobado, Rechazado, etc.)
   */
  async updateStatus(payoutId: string, status: string, notes?: string, client?: any) {
    const query = `
      UPDATE "${schema}".payouts 
      SET status = $1, admin_notes = $2, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $3 RETURNING *;
    `;
    try {
      const db = client || pool;
      const { rows } = await db.query(query, [status, notes || null, payoutId]);
      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, payoutId }, 'DB Error: update payout status failed');
      throw error;
    }
  },

  /**
   * Obtiene payouts por estado (útil para el dashboard de administración)
   */
  async getByStatus(status: string) {
    const query = `
      SELECT p.*, u.email, u.fullname 
      FROM "${schema}".payouts p
      JOIN "${schema}".users u ON p.user_id = u.id
      WHERE p.status = $1
      ORDER BY p.created_at ASC;
    `;
    try {
      const { rows } = await pool.query(query, [status]);
      return rows.map(row => this.mapRow(row));
    } catch (error: any) {
      logger.error({ error: error.message, status }, 'DB Error: get payouts by status failed');
      throw error;
    }
  },

  /**
   * Historial de retiros de un usuario específico
   */
  async getByUserId(userId: string) {
    const query = `
      SELECT * FROM "${schema}".payouts 
      WHERE user_id = $1 
      ORDER BY created_at DESC;
    `;
    try {
      const { rows } = await pool.query(query, [userId]);
      return rows.map(row => this.mapRow(row));
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'DB Error: get payouts by user failed');
      throw error;
    }
  },
};
