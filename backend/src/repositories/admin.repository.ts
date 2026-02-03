import pool from '../db/postgres';
import { config } from '../config/index';

const schema = config.db.schema || 'public';

export const adminRepository = {
  async getGlobalFinancialStats() {
    const query = `
      SELECT 
        -- 1. Ganancias de la plataforma (Tabla: platform_earnings, Columna: total_amount)
        (SELECT COALESCE(SUM(total_amount), 0) 
         FROM "${schema}".platform_earnings 
         WHERE status = 'active') as platform_net_earnings,
        
        (SELECT COALESCE(SUM(total_amount), 0) 
         FROM "${schema}".platform_earnings 
         WHERE status = 'refunded') as platform_refunded_total,
        
        -- 2. Balances de usuarios (Tabla: user_balances)
        (SELECT COALESCE(SUM(pending_balance), 0) 
         FROM "${schema}".user_balances) as total_users_pending,
        
        (SELECT COALESCE(SUM(available_balance), 0) 
         FROM "${schema}".user_balances) as total_users_available,
        
        -- 3. Métricas de órdenes (Tabla: orders, Columna: amount)
        (SELECT COUNT(*) 
         FROM "${schema}".orders 
         WHERE status = 'paid') as successful_orders_count,
        
        (SELECT COALESCE(SUM(amount), 0) 
         FROM "${schema}".orders 
         WHERE status = 'paid') as total_volume_processed
    `;

    const { rows } = await pool.query(query);
    const stats = rows[0];

    return {
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
};
