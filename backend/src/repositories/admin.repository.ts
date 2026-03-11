import pool from '../db/postgres';
import { config } from '../config/index';

export const adminRepository = {
  /**
   * Obtiene la salud financiera global, detecta discrepancias y trackea retiros de plataforma.
   * Ahora soporta filtros opcionales de fecha.
   */
  async getGlobalFinancialStats(currency: string, from?: string, to?: string) {
    const schema = config.db?.schema || 'public';
    const params: any[] = [currency];

    let dateFilter = '';
    if (from && to) {
      dateFilter = `AND created_at >= $2 AND created_at <= ($3::date + interval '1 day')`;
      params.push(from, to);
    }

    const query = `
      SELECT 
        -- 1. Balances instantáneos Plataforma
        (SELECT COALESCE(pending_balance, 0) FROM "${schema}".platform_balances WHERE currency = $1) as plat_pending,
        (SELECT COALESCE(available_balance, 0) FROM "${schema}".platform_balances WHERE currency = $1) as plat_available,
        
        -- 2. Volumen de Suscripciones (Ingreso directo plataforma, sin order_id)
        (SELECT COALESCE(SUM(total_amount), 0) FROM "${schema}".platform_earnings 
         WHERE currency = $1 AND order_id IS NULL AND status != 'refunded' ${dateFilter}) as total_subscriptions_volume,

        -- 3. Métricas de Ganancias (Desglose para Dashboard)
        (SELECT COALESCE(SUM(tax_amount), 0) FROM "${schema}".platform_earnings 
         WHERE currency = $1 AND status != 'refunded' ${dateFilter}) as total_tax_collected,
         
        (SELECT COALESCE(SUM(total_amount), 0) FROM "${schema}".platform_earnings 
         WHERE currency = $1 AND status != 'refunded' ${dateFilter}) as total_earned_period,

        -- 4. Balances de Usuarios
        (SELECT COALESCE(SUM(pending_balance), 0) FROM "${schema}".user_balances WHERE currency = $1) as users_pending,
        (SELECT COALESCE(SUM(available_balance), 0) FROM "${schema}".user_balances WHERE currency = $1) as users_available,
        
        -- 5. Retiros de Plataforma (Egresos Empresa)
        (SELECT COALESCE(SUM(amount), 0) FROM "${schema}".platform_withdrawals WHERE currency = $1 ${dateFilter}) as total_plat_withdrawn,

        -- 6. Volumen de Órdenes (Ventas de Creadores)
        (SELECT COALESCE(SUM(amount), 0) FROM "${schema}".orders 
         WHERE status = 'paid' AND currency = $1 ${dateFilter}) as total_orders_volume,
        
        -- 7. Conteo de discrepancias
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
    const subscriptionsVolume = parseFloat(s.total_subscriptions_volume);
    const ordersVolume = parseFloat(s.total_orders_volume);

    // Ecuación Maestra de Integridad
    const totalInflow = ordersVolume + subscriptionsVolume;
    const totalAccountability =
      platPending + platAvailable + usersPending + usersAvailable + platWithdrawn;

    return {
      currency,
      platform: {
        pending: platPending,
        available: platAvailable,
        withdrawnPeriod: platWithdrawn,
        taxCollectedPeriod: parseFloat(s.total_tax_collected || 0),
        totalEarnedInPeriod: parseFloat(s.total_earned_period || 0),
        subscriptionsVolume, // Para saber cuánto entró por planes
        totalEarnedHistorical: platPending + platAvailable + platWithdrawn,
      },
      users: {
        pending: usersPending,
        available: usersAvailable,
        totalInSystem: usersPending + usersAvailable,
      },
      systemIntegrity: {
        totalOrdersVolume: ordersVolume,
        totalInflow, // Órdenes + Suscripciones
        totalAccountability, // Balances + Retiros
        discrepanciesCount: parseInt(s.discrepancies_count),
        isHealthy: Math.abs(totalInflow - totalAccountability) < 0.01,
      },
    };
  },

  /**
   * Libro de Caja (Ledger) de la plataforma consolidado.
   */
  async getPlatformLedger(currency: string, from?: string, to?: string, limit: number = 100) {
    const schema = config.db?.schema || 'public';
    const params: any[] = [currency];

    let dateFilter = '';
    if (from && to) {
      dateFilter = `AND created_at >= $2 AND created_at <= ($3::date + interval '1 day')`;
      params.push(from, to);
    }

    const query = `
      SELECT * FROM (
        -- 1. INGRESOS (VENTAS + SUSCRIPCIONES)
        -- Usamos CASE para distinguir el origen dentro de la misma tabla
        SELECT 
          id, 
          CASE 
            WHEN order_id IS NOT NULL THEN 'SALE_COMMISSION'
            ELSE 'SUBSCRIPTION'
          END as entry_type, 
          total_amount as amount, 
          tax_amount, 
          -- Para suscripciones, la ganancia es el net_profit que guardas en el repo
          COALESCE(net_profit, (variable_amount + fixed_amount)) as net_gain, 
          currency, 
          CASE 
            WHEN order_id IS NOT NULL THEN 'Venta - Orden: ' || order_id
            ELSE 'Pago Suscripción Plataforma'
          END as description, 
          created_at,
          NULL as transaction_receipt, NULL as admin_name
        FROM "${schema}".platform_earnings
        WHERE currency = $1 AND status = 'active' ${dateFilter}
        
        UNION ALL

        -- 2. EGRESOS (RETIROS DE LA EMPRESA)
        SELECT 
          w.id, 
          'PLATFORM_WITHDRAWAL' as entry_type, 
          -w.amount as amount, 
          0 as tax_amount,
          -w.amount as net_gain,
          w.currency, 
          w.description, w.created_at, w.transaction_receipt, u.fullname as admin_name
        FROM "${schema}".platform_withdrawals w
        JOIN "${schema}".users u ON w.admin_id = u.id
        WHERE w.currency = $1 ${dateFilter}
      ) as ledger
      ORDER BY created_at DESC
      ${from ? '' : 'LIMIT $' + (params.length + 1)};
    `;

    if (!from) params.push(limit);

    const { rows } = await pool.query(query, params);

    return rows.map(row => ({
      ...row,
      amount: Number(row.amount),
      tax_amount: Number(row.tax_amount || 0),
      net_gain: Number(row.net_gain),
    }));
  },

  /**
   * REPORTE MAESTRO DE AUDITORÍA FISCAL (Mendoza 2026)
   * Une órdenes, ganancias de plataforma y datos de creadores para el Libro IVA.
   */
  async getTaxAuditReport(currency: string, from?: string, to?: string) {
    const schema = config.db?.schema || 'public';
    const params: any[] = [currency];

    let dateFilter = '';
    if (from && to) {
      dateFilter = `AND o.created_at >= $2 AND o.created_at <= ($3::date + interval '1 day')`;
      params.push(from, to);
    }

    const query = `
      SELECT 
        o.id as order_id,
        o.external_reference,
        o.created_at as sale_date,
        o.amount as total_order_amount,
        o.currency,
        o.gateway_fee,
        o.gateway_tax as total_gateway_tax,
        o.gateway_taxes_detail, -- El JSONB con IVA/IIBB desglosado
        
        -- Datos del Creador (Emisor real del servicio)
        u.fullname as creator_name,
        u.tax_id as creator_cuit,
        u.tax_condition as creator_tax_condition,

        -- Ganancia de la Plataforma
        pe.total_amount as platform_gross_commission,
        pe.tax_amount as platform_tax_share,
        (pe.total_amount - pe.tax_amount) as platform_net_commission,
        
        -- Status para auditoría
        o.status as order_status
      FROM "${schema}".orders o
      JOIN "${schema}".products p ON o.product_id = p.id
      JOIN "${schema}".users u ON p.creator_id = u.id
      LEFT JOIN "${schema}".platform_earnings pe ON o.id = pe.order_id
      WHERE o.currency = $1 AND o.status = 'paid' ${dateFilter}
      ORDER BY o.created_at DESC
    `;

    const { rows } = await pool.query(query, params);

    return rows.map(row => ({
      ...row,
      total_order_amount: Number(row.total_order_amount),
      gateway_fee: Number(row.gateway_fee),
      total_gateway_tax: Number(row.total_gateway_tax),
      platform_gross_commission: Number(row.platform_gross_commission),
      platform_tax_share: Number(row.platform_tax_share),
      platform_net_commission: Number(row.platform_net_commission),
    }));
  },

  /**
   * Dashboard de Retenciones (Resumen rápido para el Admin)
   */
  async getRetentionSummary(currency: string) {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        key as tax_type,
        SUM(value::numeric) as total_amount
      FROM "${schema}".orders o,
      jsonb_each_text(o.gateway_taxes_detail) 
      WHERE o.status = 'paid' AND o.currency = $1
      GROUP BY key;
    `;
    const { rows } = await pool.query(query, [currency]);
    return rows;
  },

  /**
   * Detalle de órdenes para conciliación (Paid vs Garantía)
   */
  async getReconciliationDetail(currency: string) {
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
   * Obtiene lista de reembolsos filtrados por moneda para auditoría administrativa
   */
  async getRecentRefunds(currency: string, limit: number = 50) {
    const schema = config.db?.schema || 'public';

    // Filtramos por la moneda de la orden original asociada al reembolso
    const query = `
      SELECT 
        r.*, 
        o.external_reference, 
        o.currency,
        u.email as buyer_email
      FROM "${schema}".refunds r
      JOIN "${schema}".orders o ON r.order_id = o.id
      JOIN "${schema}".users u ON r.buyer_id = u.id
      WHERE o.currency = $1
      ORDER BY r.created_at DESC
      LIMIT $2
    `;

    // Pasamos ambos parámetros: moneda y límite
    const { rows } = await pool.query(query, [currency, limit]);
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

  // --- MÉTODOS DE CUMPLIMIENTO LEY ECONOMÍA DEL CONOCIMIENTO (LEC) ---

  /**
   * Registra un log de actividad I+D para justificar el 3% de inversión.
   */
  async createRDLog(data: {
    projectId: string;
    developerId: string;
    hoursSpent: number;
    taskDescription: string;
    codeCommitRef: string;
  }) {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".lec_rd_logs 
      (project_id, developer_id, hours_spent, task_description, code_commit_ref)
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [
      data.projectId,
      data.developerId,
      data.hoursSpent,
      data.taskDescription,
      data.codeCommitRef,
    ]);
    return rows[0];
  },

  /**
   * Obtiene la métrica de inversión en I+D vs Facturación de la plataforma.
   */
  async getLECMetrics(month: number, year: number, hourlyRate: number) {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        -- Total de horas invertidas en el periodo
        (SELECT COALESCE(SUM(hours_spent), 0) FROM "${schema}".lec_rd_logs 
         WHERE EXTRACT(MONTH FROM created_at) = $1 AND EXTRACT(YEAR FROM created_at) = $2) as total_rd_hours,
        
        -- Facturación total de la plataforma (Comisiones + Suscripciones)
        (SELECT COALESCE(SUM(total_amount), 0) FROM "${schema}".platform_earnings 
         WHERE EXTRACT(MONTH FROM created_at) = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND status != 'refunded') as total_revenue;
    `;
    const { rows } = await pool.query(query, [month, year]);
    const res = rows[0];

    const totalHours = parseFloat(res.total_rd_hours);
    const revenue = parseFloat(res.total_revenue);
    const investmentValue = totalHours * hourlyRate;

    return {
      period: `${month}/${year}`,
      totalHours,
      investmentValue,
      revenue,
      complianceRatio: revenue > 0 ? (investmentValue / revenue) * 100 : 0,
    };
  },

  /**
   * Lista los proyectos de innovación activos.
   */
  async getRDProjects() {
    const schema = config.db?.schema || 'public';
    const { rows } = await pool.query(
      `SELECT * FROM "${schema}".lec_rd_projects WHERE is_active = TRUE ORDER BY start_date DESC`
    );
    return rows;
  },
};
