import pool from '../db/postgres';
import { config } from '../config/index';

export const adminRepository = {
  async getGlobalFinancialStats(currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        -- 1. Ganancias de la plataforma filtradas por moneda
        (SELECT COALESCE(SUM(total_amount), 0) 
         FROM "${schema}".platform_earnings 
         WHERE status = 'active' AND currency = $1) as platform_net_earnings,
        
        (SELECT COALESCE(SUM(total_amount), 0) 
         FROM "${schema}".platform_earnings 
         WHERE status = 'refunded' AND currency = $1) as platform_refunded_total,
        
        -- 2. Balances de usuarios filtrados por moneda
        (SELECT COALESCE(SUM(pending_balance), 0) 
         FROM "${schema}".user_balances WHERE currency = $1) as total_users_pending,
        
        (SELECT COALESCE(SUM(available_balance), 0) 
         FROM "${schema}".user_balances WHERE currency = $1) as total_users_available,
        
        -- 3. Métricas de órdenes filtradas por moneda
        (SELECT COUNT(*) 
         FROM "${schema}".orders 
         WHERE status = 'paid' AND currency = $1) as successful_orders_count,
        
        (SELECT COALESCE(SUM(amount), 0) 
         FROM "${schema}".orders 
         WHERE status = 'paid' AND currency = $1) as total_volume_processed
    `;

    const { rows } = await pool.query(query, [currency]);
    const stats = rows[0];

    return {
      currency,
      platform: {
        netEarnings: parseFloat(stats.platform_net_earnings),
        refundedTotal: parseFloat(stats.platform_refunded_total),
      },
      balances: {
        globalPending: parseFloat(stats.total_users_pending),
        globalAvailable: parseFloat(stats.total_users_available),
        totalInSystem:
          parseFloat(stats.total_users_pending) + parseFloat(stats.total_users_available),
      },
      volume: {
        ordersCount: parseInt(stats.successful_orders_count),
        totalProcessed: parseFloat(stats.total_volume_processed),
      },
    };
  },

  /**
   * Obtiene lista de reembolsos para auditoría administrativa
   */
  async getRecentRefunds(limit: number = 50) {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT r.*, o.external_reference, u.email as buyer_email
      FROM "${schema}".refunds r
      JOIN "${schema}".orders o ON r.order_id = o.id
      JOIN "${schema}".users u ON r.buyer_id = u.id
      ORDER BY r.created_at DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(query, [limit]);
    return rows;
  },
};
