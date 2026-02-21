import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

// --- INTERFACES DE CONTRATO ---

export interface PlatformPlan {
  id: string;
  name: string;
  is_free: boolean;
  is_active: boolean;
  amount: number; // Viene del JOIN con plan_prices
  currency: string;
  features?: any;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'expired';
  mp_preapproval_id?: string;
  current_period_end?: Date;
  plan_name?: string; // Del JOIN
  features?: {
    custom_fee_percent?: number;
    [key: string]: any; // Permite otras propiedades dinámicas
  };
  allowed_types?: string[]; // Del subquery json_agg
}

export const subscriptionRepository = {
  /**
   * Crea o actualiza la suscripción inicial para un Creador (Nivel 3).
   * Usamos ON CONFLICT para evitar errores si el registro ya existe.
   */
  async createInitialSubscription(
    userId: string,
    planId: string,
    currency: string = 'ARS'
  ): Promise<UserSubscription> {
    const schema = config.db?.schema || 'public';

    // ON CONFLICT asume que tienes un índice UNIQUE en user_id
    const query = `
      INSERT INTO "${schema}".user_subscriptions (
        user_id, plan_id, currency, price_at_subscription, status, updated_at
      ) VALUES ($1, $2, $3, 0, 'active', CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        plan_id = EXCLUDED.plan_id,
        status = 'active',
        currency = EXCLUDED.currency,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    try {
      const { rows } = await pool.query<UserSubscription>(query, [userId, planId, currency]);
      return rows[0];
    } catch (error: any) {
      logger.error(
        { userId, planId, error: error.message },
        'Error en upsert de suscripción inicial'
      );
      throw error;
    }
  },

  /**
   * Obtiene la suscripción activa del usuario con los beneficios del plan.
   */
  async getActiveSubscription(userId: string): Promise<UserSubscription | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT 
        us.*, 
        pp.name as plan_name, 
        pp.features,
        (SELECT json_agg(product_type_id) 
         FROM "${schema}".plan_allowed_types 
         WHERE plan_id = pp.id) as allowed_types
      FROM "${schema}".user_subscriptions us
      JOIN "${schema}".platform_plans pp ON us.plan_id = pp.id
      WHERE us.user_id = $1 AND us.status = 'active';
    `;
    try {
      const { rows } = await pool.query<UserSubscription>(query, [userId]);
      return rows[0] || null;
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Error obteniendo suscripción activa');
      throw error;
    }
  },

  /**
   * Suma el peso total de los productos de un creador (en bytes).
   */
  async getUserStorageUsage(userId: string): Promise<number> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT SUM(size_bytes) as total FROM "${schema}".products WHERE creator_id = $1`;
    try {
      const { rows } = await pool.query(query, [userId]);
      return parseInt(rows[0]?.total || '0', 10);
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Error calculando uso de almacenamiento');
      throw error;
    }
  },

  /**
   * Obtiene los datos del plan (nombre, precio, etc.)
   */
  async getPlanById(planId: string): Promise<PlatformPlan | null> {
    const schema = config.db?.schema || 'public';
    const query = `
        SELECT p.*, pp.amount, pp.currency
        FROM "${schema}".platform_plans p
        JOIN "${schema}".plan_prices pp ON p.id = pp.plan_id
        WHERE p.id = $1 AND p.is_active = true;
    `;
    const { rows } = await pool.query<PlatformPlan>(query, [planId]);
    return rows[0] || null;
  },

  /**
   * El "Upgrade": Cambia al usuario de un plan a otro usando una transacción
   */
  async upgradeUserPlan(userId: string, planId: string, mpPreapprovalId: string): Promise<void> {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const updateQuery = `
            UPDATE "${schema}".user_subscriptions
            SET plan_id = $1,
                mp_preapproval_id = $2,
                status = 'active',
                current_period_end = CURRENT_TIMESTAMP + INTERVAL '1 month',
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $3;
        `;

      await client.query(updateQuery, [planId, mpPreapprovalId, userId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Busca suscripciones que vencen en un número específico de días.
   */
  async getExpiringSubscriptions(days: number = 0): Promise<any[]> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT us.*, u.email, u.fullname, pp.name as plan_name
      FROM "${schema}".user_subscriptions us
      JOIN "${schema}".users u ON us.user_id = u.id
      JOIN "${schema}".platform_plans pp ON us.plan_id = pp.id
      WHERE us.status = 'active' 
      AND us.current_period_end::date = (CURRENT_DATE + $1 * INTERVAL '1 day')::date;
    `;
    const { rows } = await pool.query(query, [days]);
    return rows;
  },

  /**
   * Devuelve a los usuarios con plan vencido al Plan Inicial (Gratuito).
   */
  async deactivateExpiredSubscriptions(): Promise<{ user_id: string }[]> {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const planQuery = `SELECT value FROM "${schema}".system_settings WHERE key = 'default_creator_plan_id' LIMIT 1`;
      const planRes = await client.query(planQuery);
      const defaultPlanId = planRes.rows[0]?.value;

      if (!defaultPlanId) {
        throw new Error('Configuración default_creator_plan_id no encontrada en system_settings');
      }

      const updateQuery = `
        UPDATE "${schema}".user_subscriptions
        SET plan_id = $1, 
            status = 'active', 
            mp_preapproval_id = NULL,
            current_period_end = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active' 
        AND current_period_end < CURRENT_TIMESTAMP
        RETURNING user_id;
      `;

      const { rows } = await client.query(updateQuery, [defaultPlanId]);

      await client.query('COMMIT');
      return rows;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message }, 'Error procesando downgrade de suscripciones');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Fuerza el downgrade de un usuario específico al plan gratuito
   */
  async forceDowngrade(userId: string): Promise<void> {
    const schema = config.db?.schema || 'public';
    const planQuery = `SELECT value FROM "${schema}".system_settings WHERE key = 'default_creator_plan_id' LIMIT 1`;
    const planRes = await pool.query(planQuery);
    const defaultPlanId = planRes.rows[0]?.value;

    const query = `
      UPDATE "${schema}".user_subscriptions
      SET plan_id = $1, 
          status = 'active', 
          mp_preapproval_id = NULL,
          current_period_end = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2;
    `;
    await pool.query(query, [defaultPlanId, userId]);
  },

  /**
   * Registra el ingreso por suscripción en las ganancias y balances de la plataforma
   */
  async recordSubscriptionEarning(amount: number, currency: string): Promise<void> {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const earningQuery = `
        INSERT INTO "${schema}".platform_earnings (
          subscription_amount,
          total_amount,
          currency,
          status,
          balance_released,
          released_at
        ) VALUES ($1, $1, $2, 'active', TRUE, CURRENT_TIMESTAMP);
      `;
      await client.query(earningQuery, [amount, currency]);

      const balanceQuery = `
        INSERT INTO "${schema}".platform_balances (currency, available_balance)
        VALUES ($1, $2)
        ON CONFLICT (currency) 
        DO UPDATE SET 
          available_balance = platform_balances.available_balance + EXCLUDED.available_balance,
          updated_at = CURRENT_TIMESTAMP;
      `;
      await client.query(balanceQuery, [currency, amount]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error }, 'Error registrando ganancia de suscripción');
      throw error;
    } finally {
      client.release();
    }
  },
};
