import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

// --- INTERFACES ---

export interface CreatePayoutDTO {
  userId: string;
  amount: number;
  currency: string;
  destination_account: string;
  bank_name?: string | null;
  account_holder?: string | null;
  tax_id?: string | null;
  alias?: string | null;
}

export interface Payout extends Omit<CreatePayoutDTO, 'userId'> {
  id: string;
  user_id: string; // Mapeado de userId
  status: 'pending' | 'completed' | 'rejected' | 'cancelled' | 'processing';
  admin_notes?: string | null;
  transaction_receipt?: string | null;
  admin_id?: string | null;
  processed_at?: Date | null;
  created_at: Date;
  updated_at: Date;
  // Campos del JOIN (opcionales)
  email?: string;
  fullname?: string;
}

export const payoutRepository = {
  mapRow(row: any): Payout | null {
    if (!row) return null;
    return {
      ...row,
      amount: Number(row.amount),
    } as Payout;
  },

  async getByIdForUpdate(id: string, client: any): Promise<Payout | null> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".payouts WHERE id = $1 FOR UPDATE;`;
    try {
      const { rows } = await client.query(query, [id]);
      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, id }, 'DB Error: getByIdForUpdate payout failed');
      throw error;
    }
  },

  async create(data: CreatePayoutDTO, client: any): Promise<Payout | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".payouts (
        user_id, amount, currency, destination_account, 
        bank_name, account_holder, tax_id, alias, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') 
      RETURNING *;
    `;
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
  },

  async updateStatus(
    id: string,
    status: 'completed' | 'rejected' | 'cancelled' | 'processing' | 'pending',
    adminNotes: string | null = null,
    transactionReceipt: string | null = null,
    adminId: string | null = null,
    client?: any
  ): Promise<Payout | null> {
    const schema = config.db?.schema || 'public';
    const db = client || pool;

    // --- VALIDACIÓN DE SEGURIDAD ---
    // Forzamos que si el estado es de cierre (excepto 'cancelled' que lo hace el usuario),
    // debe existir un responsable.
    if (['completed', 'rejected', 'processing'].includes(status) && !adminId) {
      throw new Error(
        `El estado '${status}' requiere obligatoriamente un admin_id para auditoría.`
      );
    }

    const query = `
      UPDATE "${schema}".payouts 
      SET 
        status = $1, 
        admin_notes = COALESCE($2, admin_notes),
        transaction_receipt = COALESCE($3, transaction_receipt),
        admin_id = CASE 
                     WHEN $4::uuid IS NOT NULL THEN $4::uuid 
                     ELSE admin_id 
                   END,
        processed_at = CASE 
                         WHEN $1 IN ('completed', 'rejected') THEN CURRENT_TIMESTAMP 
                         ELSE processed_at 
                       END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5::uuid
      RETURNING *;
    `;

    try {
      const { rows } = await db.query(query, [status, adminNotes, transactionReceipt, adminId, id]);
      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error({ error: error.message, id, status }, 'DB Error: updateStatus payout failed');
      throw error;
    }
  },

  /**
   * Verifica si el usuario ya alcanzó su límite de retiros en el MES calendario actual.
   */
  async hasMonthlyPayoutLimitReached(
    userId: string,
    currency: string,
    limit: number
  ): Promise<boolean> {
    const schema = config.db?.schema || 'public';
    // date_trunc('month', CURRENT_TIMESTAMP) nos da el primer día del mes actual a las 00:00:00
    const query = `
      SELECT COUNT(*) as total FROM "${schema}".payouts 
      WHERE user_id = $1 
      AND currency = $2
      AND created_at >= date_trunc('month', CURRENT_TIMESTAMP) 
      AND status NOT IN ('rejected', 'cancelled');
    `;
    try {
      const { rows } = await pool.query(query, [userId, currency]);
      return parseInt(rows[0].total, 10) >= limit;
    } catch (error: any) {
      logger.error(
        { error: error.message, userId },
        'DB Error: hasMonthlyPayoutLimitReached failed'
      );
      return true; // Bloqueo por seguridad ante error de DB
    }
  },

  async getByUserId(userId: string): Promise<Payout[]> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".payouts WHERE user_id = $1 ORDER BY created_at DESC;`;
    const { rows } = await pool.query(query, [userId]);
    return rows.map(row => this.mapRow(row) as Payout);
  },

  /**
   * Obtiene retiros con filtros de estado y rango de fechas para exportación CSV
   */
  async getForExport(status?: string, startDate?: string, endDate?: string): Promise<Payout[]> {
    const schema = config.db?.schema || 'public';
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
      // Usamos mapRow para asegurar que 'amount' sea Number
      return rows.map(row => this.mapRow(row) as Payout);
    } catch (error: any) {
      logger.error({ error: error.message }, 'DB Error: getForExport failed');
      throw error;
    }
  },

  /**
   * Obtiene retiros filtrados por estado (pending, completed, rejected, cancelled)
   */
  async getByStatus(status: string): Promise<Payout[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT p.*, u.email, u.fullname 
      FROM "${schema}".payouts p
      JOIN "${schema}".users u ON p.user_id = u.id
      WHERE p.status = $1
      ORDER BY p.created_at ASC;
    `;

    try {
      const { rows } = await pool.query(query, [status]);
      return rows.map(row => this.mapRow(row) as Payout);
    } catch (error: any) {
      logger.error({ error: error.message, status }, 'DB Error: getByStatus failed');
      throw error;
    }
  },
};
