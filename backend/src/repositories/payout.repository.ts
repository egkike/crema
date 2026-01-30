import pool from '../db/postgres';
import { config } from '../config/index';

const schema = config.db.schema;

export const payoutRepository = {
  async create(
    data: { userId: string; amount: number; currency: string; destination: string },
    client: any
  ) {
    const query = `
      INSERT INTO "${schema}".payouts (user_id, amount, currency, destination_account)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const { rows } = await client.query(query, [
      data.userId,
      data.amount,
      data.currency,
      data.destination,
    ]);
    return rows[0];
  },

  async updateStatus(payoutId: string, status: string, notes?: string) {
    const query = `
      UPDATE "${schema}".payouts 
      SET status = $1, admin_notes = $2, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $3 RETURNING *;
    `;
    const { rows } = await pool.query(query, [status, notes, payoutId]);
    return rows[0];
  },
};
