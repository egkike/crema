import { PoolClient } from 'pg';

import pool from '../db/postgres';
import { config } from '../config/index';

export const platformWithdrawalRepository = {
  async create(
    data: {
      adminId: string;
      amount: number;
      currency: string;
      description: string;
      transactionReceipt: string;
    },
    client?: PoolClient
  ) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    const query = `
      INSERT INTO "${schema}".platform_withdrawals 
      (admin_id, amount, currency, description, transaction_receipt)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const values = [
      data.adminId,
      data.amount,
      data.currency,
      data.description,
      data.transactionReceipt,
    ];

    const { rows } = await db.query(query, values);
    return rows[0];
  },
};
