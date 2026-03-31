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
  features?: Record<string, unknown>;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'expired';
  // Nombre agnóstico para cualquier pasarela
  gateway_subscription_id?: string;
  currency: string;
  current_period_end?: Date;
  plan_name?: string;
  allowed_types?: string[];
  features?: {
    custom_fee_percent?: number;
    [key: string]: unknown;
  };
  allowed_types?: string[];
}

export const subscriptionRepository = {
  /**
   * Crea o actualiza la suscripción inicial para un Creador (Nivel 3).
   * Usamos ON CONFLICT para evitar errores si el registro ya existe.
   */
  async createInitialSubscription(
    userId: string,
    planId: string,
    currency: string
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
        COALESCE(
          json_agg(DISTINCT pat.product_type_id) FILTER (WHERE pat.product_type_id IS NOT NULL), 
          '[]'
        ) as allowed_types
      FROM "${schema}".user_subscriptions us
      JOIN "${schema}".platform_plans pp ON us.plan_id = pp.id
      LEFT JOIN "${schema}".plan_allowed_types pat ON pp.id = pat.plan_id
      WHERE us.user_id = $1 AND us.status = 'active'
      GROUP BY us.id, pp.id; -- Agrupamos para permitir la agregación de tipos
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
   * Obtiene los datos del plan filtrados por la moneda del usuario.
   */
  async getPlanById(planId: string, currency: string): Promise<PlatformPlan | null> {
    const schema = config.db?.schema || 'public';
    const query = `
        SELECT p.*, pp.amount, pp.currency
        FROM "${schema}".platform_plans p
        JOIN "${schema}".plan_prices pp ON p.id = pp.plan_id
        WHERE p.id = $1 
          AND pp.currency = $2 -- <--- FILTRO CRÍTICO
          AND p.is_active = true;
    `;
    const { rows } = await pool.query<PlatformPlan>(query, [planId, currency]);
    return rows[0] || null;
  },

  /**
   * El "Upgrade": Cambia al usuario de un plan a otro usando una transacción.
   * Ahora persiste la moneda del pago realizado.
   */
  async upgradeUserPlan(
    userId: string,
    planId: string,
    gatewaySubscriptionId: string,
    currency: string // <--- Nuevo parámetro
  ): Promise<void> {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const updateQuery = `
            UPDATE "${schema}".user_subscriptions
            SET plan_id = $1,
                gateway_subscription_id = $2,
                currency = $3, -- <--- Guardamos la moneda del upgrade
                status = 'active',
                current_period_end = CURRENT_TIMESTAMP + INTERVAL '1 month',
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $4;
        `;

      await client.query(updateQuery, [planId, gatewaySubscriptionId, currency, userId]);

      await client.query('COMMIT');

      logger.info({ userId, planId, currency }, 'Upgrade de plan procesado en DB');
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ userId, error: error.message }, 'Error en upgradeUserPlan');
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

      // 1. Obtenemos el ID del plan gratuito desde la configuración
      const planQuery = `SELECT value FROM "${schema}".system_settings WHERE key = 'default_creator_plan_id' LIMIT 1`;
      const planRes = await client.query(planQuery);
      const defaultPlanId = planRes.rows[0]?.value;

      if (!defaultPlanId) throw new Error('Configuración default_creator_plan_id no encontrada');

      // 2. Ejecutamos el Downgrade
      // Mantenemos la 'currency' actual del registro para que el usuario no cambie de divisa
      // Limpiamos gateway_subscription_id porque ya no hay un cobro recurrente activo
      const updateQuery = `
        UPDATE "${schema}".user_subscriptions
        SET plan_id = $1, 
            status = 'active', 
            gateway_subscription_id = NULL, 
            current_period_end = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active' 
          AND current_period_end < CURRENT_TIMESTAMP
          AND plan_id != $1 -- Evitamos procesar los que ya son gratuitos
        RETURNING user_id;
      `;

      const { rows } = await client.query(updateQuery, [defaultPlanId]);

      await client.query('COMMIT');

      if (rows.length > 0) {
        logger.info({ count: rows.length }, 'Suscripciones vencidas devueltas al plan gratuito');
      }

      return rows;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message }, 'Error desactivando suscripciones expiradas');
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
          gateway_subscription_id = NULL, -- Limpiamos ID de pasarela
          current_period_end = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2;
    `;
    await pool.query(query, [defaultPlanId, userId]);
  },

  /**
   * Registra el ingreso por suscripción desglosando costos de pasarela, impuestos (IVA) y beneficio neto.
   */
  async recordSubscriptionEarning(
    amount: number, // El total bruto ($30.000)
    currency: string, // Moneda (ARS, etc)
    netProfit: number, // Ganancia real de Crema
    gatewayFee: number, // Comisión pasarela
    gatewayTax: number, // Impuesto pasarela
    taxAmount: number // IVA incluido en el plan
  ): Promise<void> {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Insertamos en platform_earnings con el desglose FISCAL completo
      const earningQuery = `
        INSERT INTO "${schema}".platform_earnings (
          subscription_amount,
          total_amount,
          gateway_fee,
          gateway_tax,
          tax_amount,
          net_profit,
          currency,
          status,
          balance_released,
          released_at
        ) VALUES ($1, $1, $3, $4, $5, $6, $2, 'active', TRUE, CURRENT_TIMESTAMP);
      `;

      // Mapeo de parámetros:
      // $1: amount, $2: currency, $3: gatewayFee, $4: gatewayTax, $5: taxAmount, $6: netProfit
      await client.query(earningQuery, [
        amount,
        currency,
        gatewayFee,
        gatewayTax,
        taxAmount,
        netProfit,
      ]);

      // 2. Actualizamos el balance de la plataforma
      // Sumamos el netProfit (dinero real líquido disponible)
      const balanceQuery = `
        INSERT INTO "${schema}".platform_balances (currency, available_balance)
        VALUES ($1, $2)
        ON CONFLICT (currency) 
        DO UPDATE SET 
          available_balance = platform_balances.available_balance + EXCLUDED.available_balance,
          updated_at = CURRENT_TIMESTAMP;
      `;
      await client.query(balanceQuery, [currency, netProfit]);

      await client.query('COMMIT');

      logger.info(
        { amount, netProfit, taxAmount, currency },
        '✅ Contabilidad de suscripción registrada con IVA incluido'
      );
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error(
        { error: error.message, amount, currency },
        '💥 Error registrando ganancia de suscripción en repositorio'
      );
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Obtiene de un solo golpe el plan, los tipos permitidos y el uso actual de espacio.
   */
  async getCreatorPlanLimits(userId: string) {
    const schema = config.db?.schema || 'public';

    // Usamos una subconsulta para el almacenamiento para evitar que el JOIN
    // con plan_allowed_types duplique las filas de productos antes de sumar.
    const query = `
      SELECT 
        us.plan_id,
        pp.name as plan_name,
        pp.features,
        COALESCE(
          json_agg(DISTINCT pat.product_type_id) FILTER (WHERE pat.product_type_id IS NOT NULL), 
          '[]'
        ) as allowed_types,
        (SELECT COALESCE(SUM(size_bytes), 0) FROM "${schema}".products WHERE creator_id = $1) as current_storage_bytes
      FROM "${schema}".user_subscriptions us
      JOIN "${schema}".platform_plans pp ON us.plan_id = pp.id
      LEFT JOIN "${schema}".plan_allowed_types pat ON pp.id = pat.plan_id
      WHERE us.user_id = $1 AND us.status = 'active'
      GROUP BY us.plan_id, pp.name, pp.features;
    `;

    try {
      const { rows } = await pool.query(query, [userId]);
      if (!rows[0]) return null;

      const row = rows[0];
      const storageBytes = parseInt(row.current_storage_bytes, 10);

      return {
        planId: row.plan_id,
        planName: row.plan_name,
        features: row.features,
        allowedTypes: row.allowed_types,
        currentStorageBytes: storageBytes,
        currentStorageMb: parseFloat((storageBytes / (1024 * 1024)).toFixed(2)),
      };
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Error en getCreatorPlanLimits');
      throw error;
    }
  },
};
