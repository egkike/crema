import pool from '../db/postgres';
import { config } from '../config/index';

export const adminRepository = {
  /**
   * Obtiene la salud financiera global, detecta discrepancias y trackea retiros de plataforma.
   * Ahora soporta filtros opcionales de fecha.
   */
  async getGlobalFinancialStats(currency: string = 'ARS', from?: string, to?: string) {
    const schema = config.db?.schema || 'public';
    const params: any[] = [currency];

    // Filtro dinámico para fechas aplicado a volumen y retiros
    let dateFilter = '';
    if (from && to) {
      dateFilter = `AND created_at >= $2 AND created_at <= ($3::date + interval '1 day')`;
      params.push(from, to);
    }

    const query = `
      SELECT 
        -- 1. Balance REAL de la Plataforma (Lo que hay hoy - instantáneo)
        (SELECT COALESCE(pending_balance, 0) FROM "${schema}".platform_balances WHERE currency = $1) as plat_pending,
        (SELECT COALESCE(available_balance, 0) FROM "${schema}".platform_balances WHERE currency = $1) as plat_available,
        
        -- 1.1 Desglose de impuestos acumulados (recaudados) en el periodo
        (SELECT COALESCE(SUM(tax_amount), 0) FROM "${schema}".platform_earnings WHERE currency = $1 ${dateFilter}) as total_tax_collected,

        -- 2. Balances de Usuarios (Lo que se les debe - instantáneo)
        (SELECT COALESCE(SUM(pending_balance), 0) FROM "${schema}".user_balances WHERE currency = $1) as users_pending,
        (SELECT COALESCE(SUM(available_balance), 0) FROM "${schema}".user_balances WHERE currency = $1) as users_available,
        
        -- 3. Retiros de Plataforma (Lo que la empresa ya sacó del sistema en el periodo)
        (SELECT COALESCE(SUM(amount), 0) FROM "${schema}".platform_withdrawals WHERE currency = $1 ${dateFilter}) as total_plat_withdrawn,

        -- 4. Volumen de Órdenes PAID (El ingreso bruto total en el periodo)
        (SELECT COALESCE(SUM(amount), 0) FROM "${schema}".orders WHERE status = 'paid' AND currency = $1 ${dateFilter}) as total_paid_volume,
        
        -- 5. Conteo de discrepancias
        (SELECT COUNT(*) FROM (
            SELECT o.id
            FROM "${schema}".orders o
            LEFT JOIN "${schema}".commissions c ON o.id = c.order_id AND c.status != 'refunded'
            LEFT JOIN "${schema}".platform_earnings pe ON o.id = pe.order_id AND pe.status != 'refunded'
            WHERE o.status = 'paid' AND o.currency = $1 ${dateFilter.replace(/created_at/g, 'o.created_at')}
            GROUP BY o.id, o.amount
            HAVING ABS(o.amount - (COALESCE(SUM(c.net_amount), 0) + COALESCE(MAX(pe.total_amount), 0))) > 0.01
        ) as diffs) as discrepancies_count
    `;

    const { rows } = await pool.query(query, params);
    const s = rows[0];

    const platPending = parseFloat(s.plat_pending);
    const platAvailable = parseFloat(s.plat_available);
    const platWithdrawn = parseFloat(s.total_plat_withdrawn);
    const usersPending = parseFloat(s.users_pending);
    const usersAvailable = parseFloat(s.users_available);
    const taxCollected = parseFloat(s.total_tax_collected || 0);

    return {
      currency,
      platform: {
        pending: platPending,
        available: platAvailable,
        withdrawnPeriod: platWithdrawn,
        taxCollectedPeriod: taxCollected,
        totalEarnedHistorical: platPending + platAvailable + platWithdrawn,
      },
      users: {
        pending: usersPending,
        available: usersAvailable,
        totalInSystem: usersPending + usersAvailable,
      },
      systemIntegrity: {
        totalPaidVolume: parseFloat(s.total_paid_volume),
        totalAccountability:
          platPending + platAvailable + usersPending + usersAvailable + platWithdrawn,
        discrepanciesCount: parseInt(s.discrepancies_count),
        isHealthy:
          Math.abs(
            parseFloat(s.total_paid_volume) -
              (platPending + platAvailable + usersPending + usersAvailable + platWithdrawn)
          ) < 1,
      },
    };
  },

  /**
   * NUEVO: Libro de Caja (Ledger) de la plataforma consolidado.
   */
  async getPlatformLedger(
    currency: string = 'ARS',
    from?: string,
    to?: string,
    limit: number = 100
  ) {
    const schema = config.db?.schema || 'public';
    const params: any[] = [currency];

    let dateFilter = '';
    if (from && to) {
      dateFilter = `AND created_at >= $2 AND created_at <= ($3::date + interval '1 day')`;
      params.push(from, to);
    }

    const query = `
      SELECT * FROM (
        -- INGRESOS (Ajustado para mostrar Neto e Impuesto)
        SELECT 
          id, 
          'INCOME' as entry_type, 
          total_amount as amount, 
          tax_amount, -- <--- columna de impuestos
          (variable_amount + fixed_amount) as net_gain, -- <--- Calculamos ganancia neta
          currency, 
          'Comisión por venta - Orden: ' || order_id as description, 
          created_at,
          NULL as transaction_receipt, NULL as admin_name
        FROM "${schema}".platform_earnings
        WHERE currency = $1 AND status = 'active' ${dateFilter}
        
        UNION ALL

        -- EGRESOS
        SELECT 
          w.id, 'EXPENSE' as entry_type, -w.amount as amount, w.currency, 
          w.description, w.created_at, w.transaction_receipt, u.fullname as admin_name
        FROM "${schema}".platform_withdrawals w
        JOIN "${schema}".users u ON w.admin_id = u.id
        WHERE w.currency = $1 ${dateFilter}
      ) as ledger
      ORDER BY created_at DESC
      LIMIT ${from ? 'ALL' : '$' + (params.length + 1)};
    `;

    if (!from) params.push(limit);

    const { rows } = await pool.query(query, params);
    return rows;
  },

  /**
   * Detalle de órdenes para conciliación (Paid vs Garantía)
   */
  async getReconciliationDetail(currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        id, amount, balance_released, created_at,
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
