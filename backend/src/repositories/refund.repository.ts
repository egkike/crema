import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

export interface RefundData {
  orderId: string;
  sellerId: string | null;
  buyerId: string;
  amount: number;
  currency: string;
  reason: string;
}

export const refundRepository = {
  mapRow(row: any) {
    if (!row) return null;
    return {
      ...row,
      amount: Number(row.amount),
    };
  },

  /**
   * Crea un reembolso y actualiza el estado de las tablas financieras.
   * IMPORTANTE: Se recomienda pasar un 'client' para ejecutar esto dentro de una transacción.
   */
  async create(data: RefundData, client?: any) {
    const schema = config.db?.schema || 'public';
    const db = client || pool;

    // 1. Insertar el registro del reembolso
    const insertRefundQuery = `
      INSERT INTO "${schema}".refunds (order_id, seller_id, buyer_id, amount, currency, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const refundValues = [
      data.orderId,
      data.sellerId,
      data.buyerId,
      data.amount,
      data.currency,
      data.reason,
    ];

    // 2. Anular la ganancia de la plataforma (Ajuste Crítico para Salud Financiera)
    const updateEarningsQuery = `
      UPDATE "${schema}".platform_earnings 
      SET status = 'refunded' 
      WHERE order_id = $1;
    `;

    // 3. Marcar la orden como reembolsada (Para que no sume en el volumen pagado)
    const updateOrderQuery = `
      UPDATE "${schema}".orders 
      SET status = 'refunded' 
      WHERE id = $1;
    `;

    try {
      const { rows } = await db.query(insertRefundQuery, refundValues);

      // Ejecutamos las actualizaciones de estado
      await db.query(updateEarningsQuery, [data.orderId]);
      await db.query(updateOrderQuery, [data.orderId]);

      logger.info(
        { orderId: data.orderId },
        'Reembolso procesado y estados financieros actualizados'
      );

      return this.mapRow(rows[0]);
    } catch (error: any) {
      logger.error(
        { error: error.message, orderId: data.orderId },
        'DB Error: refundRepository.create failed'
      );
      throw error;
    }
  },

  async getByOrderId(orderId: string) {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".refunds WHERE order_id = $1 ORDER BY created_at DESC;`;
    const { rows } = await pool.query(query, [orderId]);
    return rows.map(row => this.mapRow(row));
  },
};
