import { Worker, Job } from 'bullmq';

import { redisConnection } from '../config/redis';
import { ReleaseService } from '../services/release.service';
import { PayoutService } from '../services/payout.service';
import { AuthCleanupService } from '../services/auth.cleanup.service';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { mainQueue } from '../queues/scheduler';
import { EmailService } from '../services/email.service';
import logger from '../utils/logger';

let criticalWorker: Worker | undefined;
let notificationWorker: Worker | undefined;

export const initMainWorker = () => {
  /**
   * 1. WORKER CRÍTICO: Finanzas, Suscripciones y Base de Datos
   * Concurrencia 1 para asegurar integridad transaccional y evitar race conditions en balances.
   */
  criticalWorker = new Worker(
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
                  users: result.releasedToUsers,
                  platform: result.releasedToPlatform,
                },
                '💰 CRITICAL: Liberación masiva completada exitosamente'
              );
            }
            break;
          }

          case 'subscription-check': {
            const nearExpiration = await subscriptionRepository.getExpiringSubscriptions(3);

            for (const sub of nearExpiration) {
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

            const deactivated = await subscriptionRepository.deactivateExpiredSubscriptions();

            if (nearExpiration.length > 0 || deactivated.length > 0) {
              logger.info(
                { warned: nearExpiration.length, deactivated: deactivated.length },
                'CRITICAL: Proceso de suscripciones completado'
              );
            }
            break;
          }

          case 'auth-cleanup': {
            await AuthCleanupService.cleanExpiredTokens();
            logger.info('CRITICAL: Limpieza de tokens completada.');
            break;
          }

          case 'liquidity-check': {
            // Revisa si el balance de la plataforma está por debajo del mínimo
            const alerts = await PayoutService.checkPlatformLiquidity();
            if (alerts && alerts.length > 0) {
              logger.warn({ alerts }, '💰 CRITICAL: Alertas de liquidez detectadas');
            }
            break;
          }

          case 'payout-audit': {
            // Cuenta retiros pendientes y envía resumen al admin
            const audit = await PayoutService.notifyAdminPendingPayouts();
            if (audit.pendingCount > 0) {
              logger.info({ audit }, '💰 CRITICAL: Auditoría de retiros completada');
            }
            break;
          }

          // Si llega un send-email aquí, el worker simplemente lo ignora para que lo tome el otro
          case 'send-email':
            return;

          default:
            logger.warn({ task: name }, 'CRITICAL: Tarea no reconocida');
        }
      } catch (error: any) {
        logger.error({ task: name, error: error.message }, '💥 Error en Critical Worker');
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  );

  /**
   * 2. WORKER DE NOTIFICACIONES: Emails y Alertas
   * Concurrencia 5 para procesar múltiples envíos de I/O en paralelo sin demoras.
   */
  notificationWorker = new Worker(
    'crema-tasks',
    async (job: Job) => {
      if (job.name !== 'send-email') return;

      const { type, to, data } = job.data;

      try {
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
          default:
            logger.warn({ type }, 'NOTIFY: Tipo de email no reconocido');
        }
      } catch (error: any) {
        logger.error({ type, to, error: error.message }, '💥 Error en Notification Worker');
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  // Manejo de fallos para ambos workers
  const handleFailure = (job: Job | undefined, err: Error) => {
    logger.error(
      { jobId: job?.id, task: job?.name, error: err.message },
      '❌ Tarea de BullMQ fallida definitivamente'
    );
  };

  criticalWorker.on('failed', handleFailure);
  notificationWorker.on('failed', handleFailure);
};

export const closeWorker = async () => {
  if (criticalWorker) await criticalWorker.close();
  if (notificationWorker) await notificationWorker.close();
  logger.info('SISTEMA: Workers de BullMQ cerrados correctamente.');
};
