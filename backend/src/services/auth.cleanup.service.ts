import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

export class AuthCleanupService {
  static async cleanExpiredTokens() {
    const schema = config.db.schema;
    try {
      const result = await pool.query(
        `DELETE FROM "${schema}".refresh_tokens WHERE expires_at < NOW()`
      );

      // Corregido: Si rowCount es null, tratamos como 0
      const deletedCount = result.rowCount ?? 0;

      if (deletedCount > 0) {
        logger.info(`🧹 Limpieza: Se eliminaron ${deletedCount} refresh tokens expirados.`);
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error en el Cron de limpieza de tokens');
    }
  }
}
