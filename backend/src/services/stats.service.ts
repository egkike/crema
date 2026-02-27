import pool from '../db/postgres';
import { config } from '../config/index';
import { adminRepository } from '../repositories/admin.repository';
import logger from '../utils/logger';

export class StatsService {
  /**
   * Obtiene la fecha más cercana de liberación y el monto total para ese día.
   */
  static async getNextReleaseInfo(userId: string, currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';

    // Buscamos la fecha de liberación más próxima que aún no haya sido liberada
    const query = `
    SELECT 
      (o.created_at + (o.days_of_guarantee_applied || ' days')::interval)::date as next_release_date,
      SUM(c.net_amount) as total_amount
    FROM "${schema}".orders o
    JOIN "${schema}".commissions c ON o.id = c.order_id
    WHERE c.user_id = $1 
      AND o.currency = $2
      AND o.balance_released = FALSE
      AND o.status = 'paid'
      AND o.is_guarantee_eligible = TRUE -- Solo las que siguen esperando por calendario
    GROUP BY next_release_date
    HAVING (next_release_date) >= CURRENT_DATE
    ORDER BY next_release_date ASC
    LIMIT 1;
  `;

    try {
      const { rows } = await pool.query(query, [userId, currency]);

      if (rows.length === 0) return null;

      return {
        date: rows[0].next_release_date,
        amount: Number(rows[0].total_amount),
      };
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Error al obtener próxima liberación');
      return null;
    }
  }

  /**
   * Obtiene las métricas principales del dashboard para un usuario.
   * Centraliza: Ganancia Total, Disponible, Pendiente y Retirado.
   */
  static async getCreatorStats(userId: string, currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';

    const balanceQuery = `
    SELECT 
      COALESCE(total_earned, 0) as total_earned,
      COALESCE(available_balance, 0) as available_now,
      COALESCE(pending_balance, 0) as pending_release
    FROM "${schema}".user_balances 
    WHERE user_id = $1 AND currency = $2
  `;

    const withdrawalQuery = `
    SELECT COALESCE(SUM(amount), 0) as total_withdrawn 
    FROM "${schema}".payouts 
    WHERE user_id = $1 AND currency = $2 AND status = 'completed'
  `;

    try {
      // Ejecutamos las tres consultas en paralelo
      const [balanceRes, withdrawalRes, nextRelease] = await Promise.all([
        pool.query(balanceQuery, [userId, currency]),
        pool.query(withdrawalQuery, [userId, currency]),
        this.getNextReleaseInfo(userId, currency),
      ]);

      const balance = balanceRes.rows[0] || {
        total_earned: 0,
        available_now: 0,
        pending_release: 0,
      };
      const withdrawn = withdrawalRes.rows[0].total_withdrawn;

      return {
        totalEarned: Number(balance.total_earned),
        availableBalance: Number(balance.available_now),
        pendingBalance: Number(balance.pending_release),
        totalWithdrawn: Number(withdrawn),
        nextRelease, // { date: '2024-05-20', amount: 15000.00 } o null
        currency,
      };
    } catch (error: any) {
      throw new Error(`Error al obtener estadísticas: ${error.message}`);
    }
  }

  /**
   * Obtiene ingresos diarios de los últimos 7 días para un gráfico
   */
  static async getLastSevenDaysSales(userId: string, currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        d.date::date as day,
        -- Sumamos ventas y restamos reembolsos para obtener el NETO diario
        COALESCE(SUM(
          CASE 
            WHEN bh.type IN ('sale_creator', 'sale_affiliate') THEN bh.amount 
            WHEN bh.type = 'refund' THEN -ABS(bh.amount) -- Aseguramos que el refund reste
            ELSE 0 
          END
        ), 0) as daily_net_income
      FROM (
        SELECT CURRENT_DATE - i as date
        FROM generate_series(0, 6) i
      ) d
      LEFT JOIN "${schema}".balance_history bh ON 
        bh.created_at::date = d.date 
        AND bh.user_id = $1 
        AND bh.currency = $2
      GROUP BY d.date
      ORDER BY d.date ASC;
    `;

    try {
      const { rows } = await pool.query(query, [userId, currency]);
      return rows.map(r => ({
        day: r.day,
        income: Number(r.daily_net_income),
      }));
    } catch (error: any) {
      throw new Error(`Error al obtener gráfico de ventas: ${error.message}`);
    }
  }

  /**
   * Obtiene el reporte de salud financiera para administración.
   * Ahora recibe filtros de fecha opcionales.
   */
  static async getAdminHealthCheck(currency: string = 'ARS', from?: string, to?: string) {
    // 1. Obtenemos las estadísticas base pasando las fechas al repositorio
    const stats = await adminRepository.getGlobalFinancialStats(currency, from, to);

    // 2. Detalle de órdenes recientes (para auditoría de garantías)
    const recentOrders = await adminRepository.getReconciliationDetail(currency);

    // Clasificamos órdenes por garantía
    const inGuarantee = recentOrders.filter(o => !o.guarantee_expired && !o.balance_released);
    const waitingRelease = recentOrders.filter(o => o.guarantee_expired && !o.balance_released);

    return {
      summary: stats,
      taxAuditory: {
        collectedInPeriod: stats.platform.taxCollectedPeriod,
        // Tu ganancia real es el total generado menos los impuestos que debes pagar
        netCompanyRevenue: stats.platform.totalEarnedHistorical - stats.platform.taxCollectedPeriod,
      },
      audit: {
        inGuaranteeOrdersCount: inGuarantee.length,
        inGuaranteeAmount: inGuarantee.reduce((sum, o) => sum + Number(o.amount), 0),
        pendingReleaseExpiredCount: waitingRelease.length,
        pendingReleaseExpiredAmount: waitingRelease.reduce((sum, o) => sum + Number(o.amount), 0),
      },
      healthy: stats.systemIntegrity.isHealthy && stats.systemIntegrity.discrepanciesCount === 0,
    };
  }

  /**
   * Obtiene el total_tax_collected, net_revenue y gross_revenue de la Plataforma
   */
  static async getPlatformTaxHealth(currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';
    const query = `
    SELECT 
      SUM(tax_amount) as total_tax_collected,
      SUM(variable_amount + fixed_amount + subscription_amount) as net_revenue,
      SUM(total_amount) as gross_revenue
    FROM "${schema}".platform_earnings
    WHERE currency = $1 AND status = 'active'
  `;
    const { rows } = await pool.query(query, [currency]);
    return rows[0];
  }
}
