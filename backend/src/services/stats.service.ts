import pool from '../db/postgres';
import { config } from '../config/index';

export class StatsService {
  /**
   * Obtiene las métricas principales del dashboard para un usuario.
   * Centraliza: Ganancia Total, Disponible, Pendiente y Retirado.
   */
  static async getCreatorStats(userId: string, currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        -- 1. Ganancia Histórica Total (todo lo que entró a su cuenta)
        COALESCE((
          SELECT total_earned 
          FROM "${schema}".user_balances 
          WHERE user_id = $1 AND currency = $2
        ), 0) as total_earned,
        
        -- 2. Saldo Disponible (lo que puede retirar ya mismo)
        COALESCE((
          SELECT available_balance 
          FROM "${schema}".user_balances 
          WHERE user_id = $1 AND currency = $2
        ), 0) as available_now,
        
        -- 3. Saldo Pendiente (ventas en periodo de garantía)
        COALESCE((
          SELECT pending_balance 
          FROM "${schema}".user_balances 
          WHERE user_id = $1 AND currency = $2
        ), 0) as pending_release,
        
        -- 4. Total que ya ha sido pagado al usuario con éxito
        COALESCE((
          SELECT SUM(amount) 
          FROM "${schema}".payouts 
          WHERE user_id = $1 AND currency = $2 AND status = 'completed'
        ), 0) as total_withdrawn;
    `;

    try {
      const { rows } = await pool.query(query, [userId, currency]);
      const stats = rows[0];

      return {
        totalEarned: Number(stats.total_earned),
        availableBalance: Number(stats.available_now),
        pendingBalance: Number(stats.pending_release),
        totalWithdrawn: Number(stats.total_withdrawn),
        currency,
      };
    } catch (error: any) {
      throw new Error(`Error al obtener estadísticas: ${error.message}`);
    }
  }

  /**
   * OPCIONAL: Obtiene ingresos diarios de los últimos 7 días para un gráfico
   */
  static async getLastSevenDaysSales(userId: string, currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        d.date::date as day,
        COALESCE(SUM(bh.amount), 0) as daily_income
      FROM (
        SELECT CURRENT_DATE - i as date
        FROM generate_series(0, 6) i
      ) d
      LEFT JOIN "${schema}".balance_history bh ON 
        bh.created_at::date = d.date 
        AND bh.user_id = $1 
        AND bh.currency = $2
        AND bh.type IN ('sale_creator', 'sale_affiliate')
      GROUP BY d.date
      ORDER BY d.date ASC;
    `;

    try {
      const { rows } = await pool.query(query, [userId, currency]);
      return rows.map(r => ({
        day: r.day,
        income: Number(r.daily_income),
      }));
    } catch (error: any) {
      throw new Error(`Error al obtener gráfico de ventas: ${error.message}`);
    }
  }
}
