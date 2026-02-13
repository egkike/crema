import pool from '../db/postgres';
import { config } from '../config/index';

export const adminRepository = {
  /**
   * Obtiene la salud financiera global, detecta discrepancias y trackea retiros de plataforma.
   */
  async getGlobalFinancialStats(currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';

    const query = `
      SELECT 
        -- 1. Balance REAL de la Plataforma (Lo que hay hoy)
        (SELECT COALESCE(pending_balance, 0) FROM "${schema}".platform_balances WHERE currency = $1) as plat_pending,
        (SELECT COALESCE(available_balance, 0) FROM "${schema}".platform_balances WHERE currency = $1) as plat_available,
        
        -- 2. Balances de Usuarios (Lo que se les debe)
        (SELECT COALESCE(SUM(pending_balance), 0) FROM "${schema}".user_balances WHERE currency = $1) as users_pending,
        (SELECT COALESCE(SUM(available_balance), 0) FROM "${schema}".user_balances WHERE currency = $1) as users_available,
        
        -- 3. Retiros de Plataforma (Lo que la empresa ya sacó del sistema)
        (SELECT COALESCE(SUM(amount), 0) FROM "${schema}".platform_withdrawals WHERE currency = $1) as total_plat_withdrawn,

        -- 4. Volumen de Órdenes PAID (El ingreso bruto total)
        (SELECT COALESCE(SUM(amount), 0) FROM "${schema}".orders WHERE status = 'paid' AND currency = $1) as total_paid_volume,
        
        -- 5. Conteo de discrepancias (Diferencias mayores a 0.01 entre orden y reparto de comisiones)
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

    // Cálculos de apoyo
    const platPending = parseFloat(s.plat_pending);
    const platAvailable = parseFloat(s.plat_available);
    const platWithdrawn = parseFloat(s.total_plat_withdrawn);

    const usersPending = parseFloat(s.users_pending);
    const usersAvailable = parseFloat(s.users_available);

    return {
      currency,
      platform: {
        pending: platPending,
        available: platAvailable,
        withdrawn: platWithdrawn, // Dinero que ya salió a cuenta bancaria
        totalEarnedHistorical: platPending + platAvailable + platWithdrawn, // Ganancia total histórica
      },
      users: {
        pending: usersPending,
        available: usersAvailable,
        totalInSystem: usersPending + usersAvailable,
      },
      systemIntegrity: {
        totalPaidVolume: parseFloat(s.total_paid_volume),
        // Lo que "debería" haber en el banco es la suma de balances + lo que la empresa ya retiró
        totalAccountability:
          platPending + platAvailable + usersPending + usersAvailable + platWithdrawn,
        discrepanciesCount: parseInt(s.discrepancies_count),
        // Si el totalAccountability es igual al totalPaidVolume, el sistema está 100% sano
        isHealthy:
          Math.abs(
            parseFloat(s.total_paid_volume) -
              (platPending + platAvailable + usersPending + usersAvailable + platWithdrawn)
          ) < 1,
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

  /**
   * Obtiene los últimos retiros de la plataforma (Empresa)
   */
  async getPlatformWithdrawals(limit: number = 50) {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT w.*, u.fullname as admin_name
      FROM "${schema}".platform_withdrawals w
      JOIN "${schema}".users u ON w.admin_id = u.id
      ORDER BY w.created_at DESC
      LIMIT $1
    `;
    const { rows } = await pool.query(query, [limit]);
    return rows;
  },
};
