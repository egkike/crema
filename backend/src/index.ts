import { app } from './app';
import { config } from './config/index';
import logger from './utils/logger';
import { ReleaseService } from './services/release.service';
import { initMainWorker, closeWorker } from './queues/main.worker';
import { initScheduler, closeScheduler } from './queues/scheduler';

let server: any;

// Solo arrancar si NO estamos en entorno de test
if (config.nodeEnv !== 'test') {
  // 1. Iniciar servidor HTTP
  server = app.listen(config.port, () => {
    logger.info(`🚀 Servidor en puerto ${config.port} (${config.nodeEnv})`);
  });

  // 2. Ejecutar liberación de saldos inicial
  (async () => {
    try {
      logger.info('SISTEMA: Ejecutando liberación de saldos inicial (Startup)...');
      const result = await ReleaseService.processPendingBalances(config.forceReleaseOnStartup);
      logger.info({ ordersProcessed: result.count }, 'SISTEMA: Proceso inicial completado');
    } catch (error: any) {
      logger.error({ error: error.message }, 'SISTEMA: Error en ejecución inicial');
    }
  })();

  // 3. Inicializar motores de colas
  initMainWorker();
  initScheduler();
}

// --- GRACEFUL SHUTDOWN ---
const handleShutdown = async (signal: string) => {
  logger.info(`SISTEMA: Recibida señal ${signal}. Iniciando apagado elegante...`);

  if (server) {
    server.close(async () => {
      logger.info('SISTEMA: Servidor HTTP cerrado.');
      try {
        await Promise.all([closeWorker(), closeScheduler()]);
        logger.info('SISTEMA: Apagado completado con éxito. 👋');
        process.exit(0);
      } catch (error: any) {
        logger.error({ error: error.message }, 'SISTEMA: Error durante el cierre de colas');
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export { app };