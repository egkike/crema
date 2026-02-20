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
      { name: 'release-balances', pattern: '*/30 * * * *', id: 'job-release' },
      { name: 'subscription-check', pattern: '5 0 * * *', id: 'job-subscriptions' },
      { name: 'auth-cleanup', pattern: '0 3 * * *', id: 'job-cleanup' },
    ];

    // Limpiamos y re-programamos
    const currentRepeatables = await mainQueue.getRepeatableJobs();
    for (const job of currentRepeatables) {
      await mainQueue.removeRepeatableByKey(job.key);
    }

    for (const job of jobs) {
      await mainQueue.add(
        job.name,
        {},
        {
          repeat: { pattern: job.pattern },
          jobId: job.id,
          removeOnComplete: true,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );
    }

    logger.info('📅 Scheduler sincronizado: Tareas programadas en Redis.');
  } catch (error: any) {
    logger.error({ error: error.message }, '❌ Error al inicializar Scheduler');
  }
};

// 3. Agregamos la función de cierre para el Graceful Shutdown
export const closeScheduler = async () => {
  if (mainQueue) {
    await mainQueue.close();
    logger.info('SISTEMA: Conexión de Queue BullMQ cerrada.');
  }
};
