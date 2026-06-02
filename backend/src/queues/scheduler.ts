import { Queue } from 'bullmq';

import { redisConnection } from '../config/redis';
import logger from '../utils/logger';

// 1. Declaramos y exportamos la variable pero sin asignarle el "new Queue" todavía
export let mainQueue: Queue | undefined;

export const initScheduler = async () => {
  // 2. La inicializamos aquí dentro
  mainQueue = new Queue('crema-tasks', { connection: redisConnection });

  try {
    const jobs = [
      // --- TAREAS DE LIMPIEZA DE TABLAS ---
      { name: 'auth-cleanup', pattern: '0 3 * * *' }, // 03:00 AM
      { name: 'memory-cleanup', pattern: '0 * * * *' }, // Cada hora (borrado de embeddings >30 días)
      { name: 'audit-cleanup', pattern: '0 0 * * *' }, // Diario a medianoche UTC (90-day retention de ai_sql_audit)
      // --- TAREAS DE MONITOREO FINANCIERO ---
      { name: 'release-balances', pattern: '*/30 * * * *' }, // Cada 30 min
      { name: 'subscription-check', pattern: '5 0 * * *' }, // 00:05 AM
      { name: 'liquidity-check', pattern: '0 * * * *' }, // Cada hora (Alerta de saldos bajos)
      { name: 'payout-audit', pattern: '0 9 * * *' }, // 09:00 AM (Resumen de retiros pendientes)
    ];

    // Limpiamos y re-programamos
    // Known race condition: getRepeatableJobs + removeRepeatableByKey is not atomic.
    // With single-instance scheduler this is safe. For multi-instance would need distributed lock.
    const currentRepeatables = await mainQueue.getRepeatableJobs();
    for (const job of currentRepeatables) {
      await mainQueue.removeRepeatableByKey(job.key);
    }

    for (const job of jobs) {
      await mainQueue.add(
        job.name,
        {},
        {
          jobId: `repeat:${job.name}`, // ID fijo para que no se duplique nunca
          repeat: { pattern: job.pattern },
          removeOnComplete: true, // No llenar Redis con jobs terminados
          removeOnFail: false, // Mantener los fallidos para debug
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );
    }

    logger.info('📅 Scheduler sincronizado: Tareas programadas en Redis.');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, '❌ Error al inicializar Scheduler');
  }
};

// 3. Agregamos la función de cierre para el Graceful Shutdown
export const closeScheduler = async () => {
  if (mainQueue) {
    await mainQueue.close();
    logger.info('SISTEMA: Conexión de Queue BullMQ cerrada.');
  }
};
