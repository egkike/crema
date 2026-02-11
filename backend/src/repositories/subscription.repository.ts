import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

export const subscriptionRepository = {
  /**
   * Crea la suscripción inicial para un Creador (Nivel 3).
   */
  async createInitialSubscription(userId: string, planId: string, currency: string = 'ARS') {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".user_subscriptions (
        user_id, plan_id, currency, price_at_subscription, status
      ) VALUES ($1, $2, $3, 0, 'active')
      RETURNING *;
    `;
    try {
      const { rows } = await pool.query(query, [userId, planId, currency]);
      return rows[0];
    } catch (error: any) {
      logger.error({ userId, planId, error: error.message }, 'Error creando suscripción inicial');
      throw error;
    }
  },

  /**
   * Obtiene la suscripción activa del usuario con los beneficios del plan.
   */
  async getActiveSubscription(userId: string) {
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
      const { rows } = await pool.query(query, [userId]);
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
};
