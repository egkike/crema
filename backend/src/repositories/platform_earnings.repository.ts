import { PoolClient } from 'pg';

import pool from '../db/postgres';
import { config } from '../config/index';

export interface PlatformEarningInput {
  orderId: string;
  variableAmount: number;
  fixedAmount: number;
  taxAmount: number;
  totalAmount: number;
  netProfit: number;
  currency: string;
  releaseAt: Date | string;
}

export const platformEarningsRepository = {
  /**
   * Registra la ganancia de la plataforma vinculada a una orden.
   * Fuente de verdad para el reporte de auditoría LEC (I+D).
   */
  async recordEarning(data: PlatformEarningInput, client?: PoolClient) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    const query = `
      INSERT INTO "${schema}".platform_earnings (
        order_id,
        variable_amount,
        fixed_amount,
        tax_amount,
        total_amount,
        net_profit,
        currency,
        release_at,
        status,
        balance_released
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', FALSE)
      RETURNING id;
    `;

    const values = [
      data.orderId,
      data.variableAmount,
      data.fixedAmount,
      data.taxAmount,
      data.totalAmount,
      data.netProfit,
      data.currency,
      data.releaseAt,
    ];

    const { rows } = await db.query(query, values);
    return rows[0];
  },
};
