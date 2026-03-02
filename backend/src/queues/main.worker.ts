import { Worker, Job } from 'bullmq';

import { redisConnection } from '../config/redis';
import { ReleaseService } from '../services/release.service';
import { AuthCleanupService } from '../services/auth.cleanup.service';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { mainQueue } from '../queues/scheduler';
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
              logger.info(
                {
                  count: result.count,
                  users: result.releasedToUsers, // Ver cuánto fue a creadores/afiliados
                  platform: result.releasedToPlatform, // Ver cuánto fue a la plataforma
                },
                '💰 SISTEMA: Liberación masiva completada exitosamente'
              );
            }
            break;
          }
          case 'subscription-check': {
            // 1. Obtener los que vencen en 3 días
            const nearExpiration = await subscriptionRepository.getExpiringSubscriptions(3);

            // En lugar de esperar el envío de cada mail aquí,
            // creamos una nueva tarea en la cola para cada uno.
            for (const sub of nearExpiration) {
              // USAMOS mainQueue directamente en lugar de job.queue
              if (mainQueue) {
                await mainQueue.add(
                  'send-email',
                  {
                    type: 'SUBSCRIPTION_EXPIRING_SOON',
                    to: sub.email,
                    data: {
                      fullname: sub.fullname,
                      plan_name: sub.plan_name,
                      days_left: 3,
                    },
                  },
                  {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                    removeOnComplete: true,
                  }
                );
              }
            }

            // 2. Desactivar vencidas (esta lógica se mantiene porque es DB pura)
            const deactivated = await subscriptionRepository.deactivateExpiredSubscriptions();

            if (nearExpiration.length > 0 || deactivated.length > 0) {
              logger.info(
                { warned: nearExpiration.length, deactivated: deactivated.length },
                'SISTEMA: Proceso de suscripciones completado y tareas de email delegadas'
              );
            }
            break;
          }
          case 'send-email': {
            const { type, to, data } = job.data;
            switch (type) {
              case 'BALANCE_RELEASED':
                await EmailService.sendBalanceReleasedEmail(
                  to,
                  data.fullname,
                  data.amount,
                  data.currency
                );
                break;
              case 'GUARANTEE_INVALIDATED':
                await EmailService.sendGuaranteeInvalidatedEmail(
                  to,
                  data.fullname,
                  data.productTitle,
                  data.reason
                );
                break;
              case 'PAYOUT_REQUESTED':
                await EmailService.sendPayoutRequestedEmail(
                  to,
                  data.fullname,
                  data.amount,
                  data.currency,
                  data.destination
                );
                break;
              case 'PAYOUT_CANCELLED':
                await EmailService.sendPayoutCancelledEmail(
                  to,
                  data.fullname,
                  data.amount,
                  data.currency
                );
                break;
              case 'PAYOUT_COMPLETED':
                await EmailService.sendPayoutCompletedEmail(
                  to,
                  data.fullname,
                  data.amount,
                  data.currency,
                  data.destination,
                  data.receipt
                );
                break;
              case 'PAYOUT_REJECTED':
                await EmailService.sendPayoutRejectedEmail(
                  to,
                  data.fullname,
                  data.amount,
                  data.currency,
                  data.reason
                );
                break;
              case 'SUBSCRIPTION_EXPIRING_SOON':
                await EmailService.sendExpirationWarning(
                  to,
                  data.fullname,
                  data.plan_name,
                  data.days_left
                );
                break;
              case 'SECURITY_ALERT':
                await EmailService.sendSecurityAlert(to, data.subject, data.message);
                break;
              // Aquí puedes agregar más casos: 'WELCOME_PURCHASE', 'PAYOUT_ALERT', etc.
              default:
                logger.warn({ type }, 'Tipo de email no reconocido por el worker');
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
