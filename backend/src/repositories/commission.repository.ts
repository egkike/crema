import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

// --- INTERFACES ---

export interface CreateCommissionDTO {
  userId: string; // Creador o Afiliado que recibe el dinero
  orderId: string;
  amount: number; // Monto bruto (ej: 25000)
  feeApplied: number; // Comisión de plataforma (ej: 3225)
  netAmount: number; // Lo que se acredita (ej: 21775)
  currency: string;
  type: 'creator' | 'affiliate';
  status?: 'pending' | 'paid' | 'refunded' | 'cancelled';
}

export interface Commission extends CreateCommissionDTO {
  id: string;
  createdAt: Date;
  paidAt?: Date | null;
}

// --- REPOSITORIO ---

export const commissionRepository = {
  /**
   * Mapea los nombres de columna de la DB (snake_case) a la interfaz (camelCase)
   */
  mapRowToCommission(row: any): Commission | null {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      orderId: row.order_id,
      amount: Number(row.amount),
      feeApplied: Number(row.fee_applied),
      netAmount: Number(row.net_amount),
      currency: row.currency,
      type: row.type,
      status: row.status,
      createdAt: row.created_at,
      paidAt: row.paid_at,
    };
  },

  /**
   * Crea un registro de comisión persistente.
   * Soporta transacciones externas pasando el 'client'.
   */
  async create(data: CreateCommissionDTO, client?: any) {
    const query = `
      INSERT INTO "${schema}".commissions (
        user_id, order_id, amount, fee_applied, net_amount, currency, type, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const values = [
      data.userId,
      data.orderId,
      data.amount,
      data.feeApplied,
      data.netAmount,
      data.currency,
      data.type,
      data.status || 'pending',
    ];

    try {
      const db = client || pool;
      const { rows } = await db.query(query, values);
      return this.mapRowToCommission(rows[0]);
    } catch (error: any) {
      logger.error(
        { error: error.message, orderId: data.orderId, userId: data.userId },
        'DB Error: Falló la creación de la comisión'
      );
      throw error;
    }
  },

  /**
   * Actualiza el estado de las comisiones (ej: de 'pending' a 'paid')
   */
  async updateStatusByOrder(orderId: string, newStatus: string, client?: any) {
    const query = `
      UPDATE "${schema}".commissions 
      SET status = $1, 
          paid_at = CASE WHEN $1 = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END
      WHERE order_id = $2
      RETURNING *;
    `;
    try {
      const db = client || pool;
      const { rows } = await db.query(query, [newStatus, orderId]);
      return rows.map(row => this.mapRowToCommission(row));
    } catch (error: any) {
      logger.error({ error: error.message, orderId }, 'DB Error: updateStatusByOrder falló');
      throw error;
    }
  },

  /**
   * Obtiene todas las comisiones desglosadas de una orden específica
   */
  async getByOrderId(orderId: string): Promise<Commission[]> {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "${schema}".commissions WHERE order_id = $1`,
        [orderId]
      );
      return rows.map(row => this.mapRowToCommission(row)!);
    } catch (error: any) {
      logger.error({ error: error.message, orderId }, 'DB Error: getByOrderId falló');
      throw error;
    }
  },

  /**
   * Obtiene el historial de ganancias de un usuario (para su panel)
   */
  async getByUserId(userId: string): Promise<Commission[]> {
    try {
      const query = `
        SELECT c.*, o.external_reference 
        FROM "${schema}".commissions c
        JOIN "${schema}".orders o ON c.order_id = o.id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC;
      `;
      const { rows } = await pool.query(query, [userId]);
      return rows.map(row => this.mapRowToCommission(row)!);
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'DB Error: getByUserId falló');
      throw error;
    }
  },
};
