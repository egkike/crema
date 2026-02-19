import { Worker, Job } from 'bullmq';

import { redisConnection } from '../config/redis';
import { ReleaseService } from '../services/release.service';
import { AuthCleanupService } from '../services/auth.cleanup.service';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { EmailService } from '../services/email.service';
import logger from '../utils/logger';

let worker: Worker | undefined;

export const initMainWorker = () => {
  const worker = new Worker(
    'crema-tasks',
    async (job: Job) => {
      const { name } = job;

      try {
        switch (name) {
          case 'release-balances': {
            const result = await ReleaseService.processPendingBalances();
            if (result.count > 0) {
              logger.info({ count: result.count }, 'SISTEMA: Dinero liberado vía BullMQ');
            }
            break;
          }

          case 'subscription-check': {
            // 1. Avisar a los que vencen en 3 días
            const nearExpiration = await subscriptionRepository.getExpiringSubscriptions(3);
            for (const sub of nearExpiration) {
              await EmailService.sendExpirationWarning(sub.email, sub.fullname, sub.plan_name, 3);
            }
            // 2. Desactivar vencidas
            const deactivated = await subscriptionRepository.deactivateExpiredSubscriptions();
            if (deactivated.length > 0) {
              logger.info({ count: deactivated.length }, 'SISTEMA: Subs desactivadas vía BullMQ');
            }
            break;
          }

          case 'auth-cleanup': {
            await AuthCleanupService.cleanExpiredTokens();
            logger.info('SISTEMA: Limpieza de tokens completada.');
            break;
          }

          default:
            logger.warn({ task: name }, 'SISTEMA: Tarea no reconocida en el worker');
        }
      } catch (error: any) {
        logger.error({ task: name, error: error.message }, '💥 Error en proceso de BullMQ');
        throw error; // Esto permite que BullMQ intente de nuevo si falla
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // Procesamiento secuencial para proteger la integridad de la DB
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, task: job?.name, error: err.message },
      '❌ Tarea de BullMQ fallida definitivamente'
    );
  });
};

// Función para cerrar el worker
export const closeWorker = async () => {
  if (worker) {
    await worker.close();
    logger.info('SISTEMA: Worker de BullMQ cerrado.');
  }
};
