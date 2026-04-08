import pool from '../db/postgres';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/ip.util';
import { config } from '../config/index';

// --- Lógica de Caché para Niveles de Usuario ---
let cachedLevels: Record<string, number> | null = null;
let lastFetch: number = 0;
const CACHE_TTL = 1000 * 60 * 5; // 5 minutos de vida para el caché

// --- Lógica de Caché para Campos de Monedas ---
let cachedFields: Record<string, string[]> = {};
let lastFieldsFetch: number = 0;

// --- Lógica de Caché para Reglas de Validación ---
let cachedRules: Record<string, any> = {};
let lastRulesFetch: number = 0;

export const configRepository = {
  /**
   * Obtiene los niveles de usuario desde system_settings con caché en memoria.
   */
  async getUserLevels(): Promise<Record<string, number>> {
    const now = Date.now();

    if (cachedLevels && now - lastFetch < CACHE_TTL) {
      return cachedLevels;
    }

    const levelsJson = await this.getSetting('user_levels', '');

    try {
      if (levelsJson) {
        cachedLevels = JSON.parse(levelsJson);
        lastFetch = now;
        return cachedLevels!;
      }
    } catch (err: any) {
      logger.error(
        { msg: err.message },
        'Error cargando user_levels desde DB, usando fallback estático'
      );
    }

    return { GUEST: 0, USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 10, ADMIN: 99 };
  },

  /**
   * Limpia el caché de niveles. Llamar después de actualizar system_settings.
   */
  clearLevelsCache(): void {
    cachedLevels = null;
    logger.info('Caché de niveles de usuario limpiado.');
  },

  /**
   * Obtiene configuraciones numéricas filtradas por moneda.
   */
  async getConfigsByCurrency(currency: string): Promise<Record<string, number>> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT key, value 
      FROM "${schema}".platform_configs 
      WHERE currency = $1
    `;

    try {
      const { rows } = await pool.query(query, [currency]);

      if (rows.length === 0) {
        throw new Error(
          `Configuración crítica no encontrada en platform_configs para la moneda: ${currency}`
        );
      }

      return rows.reduce(
        (acc, row) => {
          acc[row.key] = Number(row.value);
          return acc;
        },
        {} as Record<string, number>
      );
    } catch (error: unknown) {
      logger.error({ error: getErrorMessage(error), currency }, 'DB Error: getConfigsByCurrency failed');
      throw error;
    }
  },

  /**
   * Actualiza o inserta una configuración de plataforma (Upsert)
   */
  async upsertPlatformConfig(key: string, currency: string, value: number, description?: string) {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".platform_configs (key, currency, value, description, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (key, currency) 
      DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [key, currency, value, description || null]);
    return rows[0];
  },

  /**
   * Obtiene todas las configuraciones de texto (Globales)
   */
  async getSystemSettings(): Promise<Record<string, string>> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT key, value FROM "${schema}".system_settings`;
    try {
      const { rows } = await pool.query(query);
      return rows.reduce(
        (acc, row) => {
          acc[row.key] = row.value;
          return acc;
        },
        {} as Record<string, string>
      );
    } catch (error: unknown) {
      logger.error({ error: getErrorMessage(error) }, 'DB Error: getSystemSettings failed');
      throw error;
    }
  },

  /**
   * Obtiene un setting específico con fallback
   */
  async getSetting(key: string, defaultValue: string = ''): Promise<string> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT value FROM "${schema}".system_settings WHERE key = $1`;
    try {
      const { rows } = await pool.query(query, [key]);
      return rows[0]?.value ?? defaultValue;
    } catch (error: unknown) {
      logger.error({ error: getErrorMessage(error), key }, 'Error fetching setting');
      return defaultValue;
    }
  },

  /**
   * Obtiene los campos obligatorios para el método de cobro de una moneda.
   * Incluye caché de 5 minutos para optimizar performance.
   */
  async getRequiredFieldsByCurrency(currencyCode: string): Promise<string[]> {
    const now = Date.now();

    if (cachedFields[currencyCode] && now - lastFieldsFetch < CACHE_TTL) {
      return cachedFields[currencyCode];
    }

    const schema = config.db?.schema || 'public';
    const query = `
      SELECT required_payout_fields 
      FROM "${schema}".enabled_currencies 
      WHERE code = $1 AND is_active = true
    `;

    try {
      const { rows } = await pool.query(query, [currencyCode]);
      const fields = rows[0]?.required_payout_fields || [];

      cachedFields[currencyCode] = fields;
      lastFieldsFetch = now;

      return fields;
    } catch (error: unknown) {
      logger.error({ error: getErrorMessage(error), currencyCode }, 'Error fetching required_payout_fields');
      return [];
    }
  },

  /**
   * Limpia el caché de campos requeridos.
   */
  clearFieldsCache(): void {
    cachedFields = {};
    cachedRules = {};
    logger.info('Cachés de campos y reglas de monedas limpiados.');
  },

  /**
   * Obtiene reglas de validacion de moneda con caché.
   */
  async getCurrencyValidationRules(currencyCode: string): Promise<any> {
    const now = Date.now();

    if (cachedRules[currencyCode] && now - lastRulesFetch < CACHE_TTL) {
      return cachedRules[currencyCode];
    }

    const schema = config.db?.schema || 'public';
    const query = `SELECT validation_rules FROM "${schema}".enabled_currencies WHERE code = $1`;

    try {
      const { rows } = await pool.query(query, [currencyCode]);
      const rules = rows[0]?.validation_rules || {};

      cachedRules[currencyCode] = rules;
      lastRulesFetch = now;

      return rules;
    } catch (error: unknown) {
      logger.error({ error: getErrorMessage(error), currencyCode }, 'Error fetching validation_rules');
      return {};
    }
  },

  /**
   * Obtiene las pasarelas de pago habilitadas para una moneda específica.
   * Ordenadas por prioridad.
   */
  async getGatewaysByCurrency(currencyCode: string) {
    const schema = config.db?.schema || 'public';
    const query = `
    SELECT g.id, g.name, cg.is_default, cg.priority
    FROM "${schema}".payment_gateways g
    JOIN "${schema}".currency_gateways cg ON g.id = cg.gateway_id
    WHERE cg.currency_code = $1 AND g.is_active = true
    ORDER BY cg.priority DESC, g.name ASC
  `;

    try {
      const { rows } = await pool.query(query, [currencyCode]);
      return rows;
    } catch (error: unknown) {
      logger.error({ error: getErrorMessage(error), currencyCode }, 'Error fetching gateways for currency');
      return [];
    }
  },

  async getEnabledCurrencies() {
    const schema = config.db?.schema || 'public';
    const query = `SELECT code FROM "${schema}".enabled_currencies WHERE is_active = true`;
    const { rows } = await pool.query(query);
    return rows; // Retorna [{code: 'ARS'}, {code: 'USDT'}]
  },
};
