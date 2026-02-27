import pool from '../db/postgres';
import { config } from '../config/index';

export const payoutMethodRepository = {
  async getByUserId(userId: string) {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".user_payout_methods WHERE user_id = $1 ORDER BY currency ASC`;
    const { rows } = await pool.query(query, [userId]);
    return rows;
  },

  async getById(id: string) {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".user_payout_methods WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
  },

  /**
   * Crea o actualiza el método de pago (Sincronizado con la validación de seguridad)
   */
  async upsert(
    userId: string,
    currency: string,
    type: 'bank_account' | 'crypto_wallet',
    data: any
  ) {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".user_payout_methods (user_id, currency, type, data, is_default)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (user_id, currency, is_default) 
      DO UPDATE SET 
        type = EXCLUDED.type,
        data = EXCLUDED.data,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [userId, currency, type, data]);
    return rows[0];
  },

  /**
   * Obtiene la moneda principal de cobro del usuario.
   */
  async getUserCurrency(userId: string): Promise<string | null> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT currency FROM "${schema}".user_payout_methods WHERE user_id = $1 AND is_default = true LIMIT 1`;
    const { rows } = await pool.query(query, [userId]);
    return rows[0]?.currency || null;
  },
};
