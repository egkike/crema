import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

// Definimos la interfaz para que el Service no tenga errores de tipado
export interface CreatePayoutDTO {
  userId: string;
  amount: number;
  currency: string;
  destination_account: string;
  bank_name?: string | undefined;
  account_holder?: string | undefined;
  tax_id?: string | undefined;
  alias?: string | undefined;
}

export const payoutRepository = {
  mapRow(row: any) {
    if (!row) return null;
    return {
      ...row,
      amount: Number(row.amount),
    };
  },

  /**
   * Obtiene un payout bloqueando la fila para actualización.
   */
  async getByIdForUpdate(id: string, client: any) {
    const query = `
      SELECT * FROM "${schema}".payouts 
      WHERE id = $1 
      FOR UPDATE;
    `;
    try {
      const { rows } = await client.query(query, [id]);
      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, id }, 'DB Error: getByIdForUpdate payout failed');
      throw error;
    }
  },

  /**
   * Crea el registro con todos los campos de transferencia argentinos.
   */
  async create(data: CreatePayoutDTO, client: any) {
    const query = `
      INSERT INTO "${schema}".payouts (
        user_id, amount, currency, destination_account, 
        bank_name, account_holder, tax_id, alias, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') 
      RETURNING *;
    `;
    try {
      const values = [
        data.userId,
        data.amount,
        data.currency,
        data.destination_account,
        data.bank_name || null,
        data.account_holder || null,
        data.tax_id || null,
        data.alias || null,
      ];

      const { rows } = await client.query(query, values);
      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, userId: data.userId }, 'DB Error: Create payout failed');
      throw error;
    }
  },

  /**
   * Actualiza estado con soporte para recibos de transacción y ID de administrador.
   */
  async updateStatus(
    id: string,
    status: string,
    adminNotes: string | null = null,
    transactionReceipt: string | null = null,
    adminId: string | null = null,
    client?: any
  ) {
    const db = client || pool;

    const query = `
    UPDATE "${schema}".payouts 
    SET 
      status = $1::text, 
      admin_notes = COALESCE($2::text, admin_notes),
      transaction_receipt = COALESCE($3::text, transaction_receipt),
      admin_id = COALESCE($4::uuid, admin_id),
      processed_at = CASE 
        WHEN $1::text = 'completed' OR $1::text = 'rejected' THEN CURRENT_TIMESTAMP 
        ELSE processed_at 
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5::uuid
    RETURNING *;
  `;

    try {
      const values = [status, adminNotes || null, transactionReceipt || null, adminId || null, id];

      const { rows } = await db.query(query, values);
      return rows[0] || null;
    } catch (error: any) {
      logger.error({ payoutId: id, error: error.message }, 'DB Error: updateStatus payout failed');
      throw error;
    }
  },

  /**
   * Obtiene payouts por estado con info del usuario.
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
   * Historial de retiros de un usuario específico.
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

  async hasRecentPayout(userId: string): Promise<boolean> {
    const query = `
    SELECT id FROM "${schema}".payouts 
    WHERE user_id = $1 
    AND created_at >= CURRENT_DATE 
    AND status != 'rejected'
    LIMIT 1;
  `;
    const { rows } = await pool.query(query, [userId]);
    return rows.length > 0;
  },

  /**
   * Obtiene todos los retiros con info de usuario para reportes globales
   */
  async getAll() {
    const query = `
      SELECT p.*, u.email, u.fullname 
      FROM "${schema}".payouts p
      JOIN "${schema}".users u ON p.user_id = u.id
      ORDER BY p.created_at DESC;
    `;
    try {
      const { rows } = await pool.query(query);
      return rows.map(row => this.mapRow(row));
    } catch (error: any) {
      logger.error({ error: error.message }, 'DB Error: getAll payouts failed');
      throw error;
    }
  },

  /**
   * Obtiene retiros con filtros de estado y rango de fechas
   */
  async getForExport(status?: string, startDate?: string, endDate?: string) {
    let query = `
      SELECT p.*, u.email, u.fullname 
      FROM "${schema}".payouts p
      JOIN "${schema}".users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const values: any[] = [];

    if (status) {
      values.push(status);
      query += ` AND p.status = $${values.length}`;
    }

    if (startDate && endDate) {
      values.push(startDate, endDate);
      query += ` AND p.created_at BETWEEN $${values.length - 1} AND $${values.length}`;
    }

    query += ` ORDER BY p.created_at DESC`;

    try {
      const { rows } = await pool.query(query, values);
      return rows.map(row => this.mapRow(row));
    } catch (error: any) {
      logger.error({ error: error.message }, 'DB Error: getForExport failed');
      throw error;
    }
  },
};
