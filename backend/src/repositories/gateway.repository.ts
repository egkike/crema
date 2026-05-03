import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

// Schema validation uses config.allowedSchemas (from config/index.ts)

function getSafeSchema(): string {
  const schema = config.db?.schema || 'public';
  return config.allowedSchemas.includes(schema) ? schema : 'public';
}

export interface Gateway {
  id: string;
  name: string;
  liquidity_delay_days: number;
  is_active: boolean;
  supports_refunds: boolean;
  supports_subscriptions: boolean;
}

export const gatewayRepository = {
  /**
   * Obtiene los días de liquidez/retención de una pasarela específica.
   * Si no existe o hay error, devuelve 0 por seguridad (liberación inmediata).
   */
  async getLiquidityDays(gatewayId: string): Promise<number> {
    const schema = getSafeSchema();
    const query = `
      SELECT liquidity_delay_days 
      FROM "${schema}".payment_gateways 
      WHERE id = $1
    `;

    try {
      const { rows } = await pool.query(query, [gatewayId]);

      if (rows.length === 0) {
        logger.warn({ gatewayId }, '⚠️ Pasarela no encontrada, asumiendo 0 días de liquidez');
        return 0;
      }

      return rows[0].liquidity_delay_days || 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: message, gatewayId }, 'DB Error: getLiquidityDays failed');
      return 0;
    }
  },

  /**
   * Obtiene la información completa de una pasarela
   */
  async getById(id: string): Promise<Gateway | null> {
    const schema = getSafeSchema();
    const query = `SELECT * FROM "${schema}".payment_gateways WHERE id = $1`;

    try {
      const { rows } = await pool.query(query, [id]);
      return rows[0] || null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: message, id }, 'DB Error: gatewayRepository.getById failed');
      throw error;
    }
  },

  /**
   * Verifica si una pasarela soporta devoluciones (refunds)
   * Las pasarelas crypto (blockonomics) no soportan refunds
   */
  async getSupportsRefunds(gatewayId: string): Promise<boolean> {
    const schema = getSafeSchema();
    const query = `
      SELECT supports_refunds 
      FROM "${schema}".payment_gateways 
      WHERE id = $1
    `;

    try {
      const { rows } = await pool.query(query, [gatewayId]);
      return rows.length > 0 ? (rows[0].supports_refunds ?? false) : false;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ error: message, gatewayId }, '⚠️ Error getSupportsRefunds, defaults to false');
      return false;
    }
  },

  /**
   * Verifica si una pasarela soporta suscripciones recurrentes
   * Blockonomics no soporta suscripciones nativas
   */
  async getSupportsSubscriptions(gatewayId: string): Promise<boolean> {
    const schema = getSafeSchema();
    const query = `
      SELECT supports_subscriptions 
      FROM "${schema}".payment_gateways 
      WHERE id = $1
    `;

    try {
      const { rows } = await pool.query(query, [gatewayId]);
      return rows.length > 0 ? (rows[0].supports_subscriptions ?? false) : false;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ error: message, gatewayId }, '⚠️ Error getSupportsSubscriptions, defaults to false');
      return false;
    }
  },
};
