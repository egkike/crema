import pool from '../db/postgres';
import { config } from '../config/index';

export const adminRepository = {
  /**
   * Obtiene la salud financiera global y detecta discrepancias.
   */
  async getGlobalFinancialStats(currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';

    const query = `
      SELECT 
        -- 1. Balance REAL de la Plataforma
        (SELECT COALESCE(pending_balance, 0) FROM "${schema}".platform_balances WHERE currency = $1) as plat_pending,
        (SELECT COALESCE(available_balance, 0) FROM "${schema}".platform_balances WHERE currency = $1) as plat_available,
        
        -- 2. Balances de Usuarios
        (SELECT COALESCE(SUM(pending_balance), 0) FROM "${schema}".user_balances WHERE currency = $1) as users_pending,
        (SELECT COALESCE(SUM(available_balance), 0) FROM "${schema}".user_balances WHERE currency = $1) as users_available,
        
        -- 3. Volumen de Órdenes PAID
        (SELECT COALESCE(SUM(amount), 0) FROM "${schema}".orders WHERE status = 'paid' AND currency = $1) as total_paid_volume,
        
        -- 4. Conteo de discrepancias (Diferencias mayores a 0.01)
        (SELECT COUNT(*) FROM (
            SELECT o.id
            FROM "${schema}".orders o
            LEFT JOIN "${schema}".commissions c ON o.id = c.order_id AND c.status != 'refunded'
            LEFT JOIN "${schema}".platform_earnings pe ON o.id = pe.order_id AND pe.status != 'refunded'
            WHERE o.status = 'paid' AND o.currency = $1
            GROUP BY o.id, o.amount
            HAVING ABS(o.amount - (COALESCE(SUM(c.net_amount), 0) + COALESCE(MAX(pe.total_amount), 0))) > 0.01
        ) as diffs) as discrepancies_count
    `;

    const { rows } = await pool.query(query, [currency]);
    const s = rows[0];

    return {
      currency,
      platform: {
        pending: parseFloat(s.plat_pending),
        available: parseFloat(s.plat_available),
        total: parseFloat(s.plat_pending) + parseFloat(s.plat_available),
      },
      users: {
        pending: parseFloat(s.users_pending),
        available: parseFloat(s.users_available),
        total: parseFloat(s.users_pending) + parseFloat(s.users_available),
      },
      systemIntegrity: {
        totalPaidVolume: parseFloat(s.total_paid_volume),
        totalInBalances:
          parseFloat(s.plat_pending) +
          parseFloat(s.plat_available) +
          parseFloat(s.users_pending) +
          parseFloat(s.users_available),
        discrepanciesCount: parseInt(s.discrepancies_count),
      },
    };
  },

  /**
   * Detalle de órdenes para conciliación (Paid vs Garantía)
   */
  async getReconciliationDetail(currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        id, 
        amount, 
        balance_released, 
        created_at,
        (created_at + (days_of_guarantee_applied || ' days')::INTERVAL) as release_date,
        ((created_at + (days_of_guarantee_applied || ' days')::INTERVAL) <= NOW()) as guarantee_expired
      FROM "${schema}".orders
      WHERE status = 'paid' AND currency = $1
      ORDER BY created_at DESC
      LIMIT 100;
    `;
    const { rows } = await pool.query(query, [currency]);
    return rows;
  },

  /**
   * ✅ RESTAURADO: Obtiene lista de reembolsos para auditoría administrativa
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
