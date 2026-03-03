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
      const result = await ReleaseService.processPendingBalances(false);
      logger.info({ ordersProcessed: result.count }, 'SISTEMA: Proceso inicial completado');
    } catch (error: any) {
      logger.error({ error: error.message }, 'SISTEMA: Error en ejecución inicial');
    }
  })();

  // 3. Inicializar motores de colas
  initMainWorker();
  initScheduler().catch(err => {
    logger.error({ err }, 'SISTEMA: Fallo crítico al inicializar el Scheduler');
  });
}

// --- GRACEFUL SHUTDOWN ---
const handleShutdown = async (signal: string) => {
  logger.info(`SISTEMA: Recibida señal ${signal}. Iniciando apagado elegante...`);

  // Disyuntor de emergencia: Si en 10 segundos no cerró, forzamos la salida.
  const forceExitTimeout = setTimeout(() => {
    logger.error(
      'SISTEMA: No se pudo cerrar limpiamente en el tiempo previsto. Forzando salida...'
    );
    process.exit(1);
  }, 10000); // 10 segundos es un estándar seguro

  // Permitimos que el timer no bloquee el cierre natural si todo termina antes.
  forceExitTimeout.unref();

  try {
    // Iniciamos todos los cierres en paralelo para máxima eficiencia
    const closes: Promise<void | unknown>[] = [];

    if (server) {
      // Envolvemos server.close en una promesa
      closes.push(new Promise(resolve => server.close(resolve)));
      logger.info('SISTEMA: Cerrando servidor HTTP...');
    }

    // closeWorker y closeScheduler ya devuelven promesas, así que van directo
    closes.push(closeWorker());
    closes.push(closeScheduler());

    // Esperamos a que todas las promesas se cumplan
    await Promise.all(closes);

    clearTimeout(forceExitTimeout);

    // logger.flush() asegura que los mensajes en memoria se envíen a los transportes (archivo/consola)
    if ((logger as any).flush) {
      (logger as any).flush();
    }
    logger.info('SISTEMA: Apagado completado con éxito. 👋');

    // Pequeño delay para que el hilo de pino-roll termine de escribir al disco
    setTimeout(() => process.exit(0), 500);
  } catch (error: any) {
    logger.error({ error: error.message }, 'SISTEMA: Error durante el proceso de apagado');
    process.exit(1);
  }
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export { app };
