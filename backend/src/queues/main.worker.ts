import { Worker, Job } from 'bullmq';

import { redisConnection } from '../config/redis';
import { ReleaseService } from '../services/release.service';
import { PayoutService } from '../services/payout.service';
import { AuthCleanupService } from '../services/auth.cleanup.service';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { mainQueue } from '../queues/scheduler';
import { EmailService } from '../services/email.service';
import logger from '../utils/logger';
import pool from '../db/postgres';
import { config } from '../config/index';

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

          case 'memory-cleanup': {
            // Assumes modern PostgreSQL with standard_conforming_strings = ON (PostgreSQL 9.1+)
            // Schema from config - canonical source: backend/src/config/index.ts (config.db.schema)
            // Uses config.allowedSchemas to prevent hardcoding drift
            const schema = (config.db?.schema || 'public').trim();
            if (!config.allowedSchemas.includes(schema)) {
              logger.error({ schema, allowedSchemas: config.allowedSchemas }, 'CRITICAL: Invalid schema for memory-cleanup, skipping');
              break;
            }

            // Index idx_ai_embeddings_created exists on (created_at DESC) - verified in DB
            // Migration: db/init/06-ai-indexes.sql line 8
            // PostgreSQL can use a DESC index for ASC ordering via reverse scan (OK for our use case)
            // Runtime verification: first batch uses EXPLAIN to confirm index usage (logged on first run)

            // Parse and validate retention days (must be positive integer, max 36500 = 100 years)
            const retentionDaysStr = process.env.MEMORY_RETENTION_DAYS || '30';
            const retentionDays = parseInt(retentionDaysStr, 10);
            if (isNaN(retentionDays) || retentionDays <= 0 || !Number.isInteger(retentionDays) || retentionDays > 36500) {
              logger.error({ retentionDays, raw: retentionDaysStr }, 'CRITICAL: Invalid MEMORY_RETENTION_DAYS (must be 1-36500 days), skipping');
              break;
            }

            // Parse and validate batch configuration via env vars
            // BATCH_SIZE is validated as a positive integer in range [1, 10000].
            // LIMIT uses $2 / $4 parameterization for safety (defense in depth).
            const BATCH_SIZE_STR = process.env.MEMORY_CLEANUP_BATCH_SIZE || '1000';
            const BATCH_SIZE = parseInt(BATCH_SIZE_STR, 10);
            if (isNaN(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 10000) {
              logger.error({ BATCH_SIZE, raw: BATCH_SIZE_STR }, 'CRITICAL: Invalid MEMORY_CLEANUP_BATCH_SIZE (must be 1-10000), skipping');
              break;
            }

            const BATCH_DELAY_MS_STR = process.env.MEMORY_CLEANUP_BATCH_DELAY_MS || '100';
            const BATCH_DELAY_MS = parseInt(BATCH_DELAY_MS_STR, 10);
            if (isNaN(BATCH_DELAY_MS) || BATCH_DELAY_MS < 0 || BATCH_DELAY_MS > 10000) {
              logger.error({ BATCH_DELAY_MS, raw: BATCH_DELAY_MS_STR }, 'CRITICAL: Invalid MEMORY_CLEANUP_BATCH_DELAY_MS, skipping');
              break;
            }

            // Safety: max iterations to prevent runaway cleanup
            const MAX_ITERATIONS_STR = process.env.MEMORY_CLEANUP_MAX_ITERATIONS || '360';
            const MAX_ITERATIONS = parseInt(MAX_ITERATIONS_STR, 10);
            if (isNaN(MAX_ITERATIONS) || MAX_ITERATIONS < 1) {
              logger.error({ MAX_ITERATIONS, raw: MAX_ITERATIONS_STR }, 'CRITICAL: Invalid MEMORY_CLEANUP_MAX_ITERATIONS, skipping');
              break;
            }

            const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

            let totalDeleted = 0;
            // Use composite cursor (created_at, id) for deterministic ordering
            // This handles UUIDs correctly - ordering by created_at ensures we process oldest first
            // NOTE: The composite tuple (created_at, id) > (cursor) requires both columns to be evaluated
            // This may cause PostgreSQL to scan rows matching created_at < cutoff before applying cursor filter
            // For large tables with many rows newer than cutoff, this adds overhead per batch
            let lastCreatedAt: string | null = null;
            let lastId: string | null = null;
            let iterations = 0;

            logger.info(
              { schema, cutoff: cutoff.toISOString(), retentionDays, BATCH_SIZE, MAX_ITERATIONS },
              'CRITICAL: Iniciando cleanup de embeddings antiguos'
            );

            try {
              while (true) {
                iterations++;

                // Safety check: stop if we're taking too long (hourly job)
                if (iterations > MAX_ITERATIONS) {
                  logger.warn(
                    { iterations, totalDeleted, maxIterations: MAX_ITERATIONS },
                    'CRITICAL: Cleanup interrupted - reached max iterations (possible backlog)'
                  );
                  break;
                }

                // Use composite cursor (created_at, id) to avoid UUID ordering issues
                // ORDER BY created_at ASC ensures we delete oldest rows first (uses idx_ai_embeddings_created index)
                // Use RETURNING to get the actual last deleted row from this batch
                // Use valid UUID sentinel for first iteration (not empty string which breaks UUID comparison)
                const UUID_SENTINEL = '00000000-0000-0000-0000-000000000000';

                let query: string;
                let params: unknown[];

                if (lastCreatedAt === null) {
                  // First batch: start from the oldest rows (no cursor yet)
                  // PostgreSQL does not support ORDER BY/LIMIT directly in DELETE
                  // Use CTE to select ids with ordering, then delete by id
                  // Wrap outer DELETE in a SELECT FROM DELETE to guarantee RETURNING order matches CTE ORDER BY
                  query = `
                    SELECT created_at, id FROM (
                      WITH to_delete AS (
                        SELECT id FROM "${schema}".ai_embeddings
                        WHERE created_at < $1
                        ORDER BY created_at ASC, id ASC
                        LIMIT $2
                      )
                      DELETE FROM "${schema}".ai_embeddings
                      WHERE id IN (SELECT id FROM to_delete)
                      RETURNING created_at, id
                    ) AS deleted_rows
                    ORDER BY created_at ASC, id ASC
                  `;
                  params = [cutoff, BATCH_SIZE];
                } else {
                  // Subsequent batches: use composite cursor to avoid skipping rows
                  // Wrap outer DELETE in SELECT to guarantee RETURNING order
                  query = `
                    SELECT created_at, id FROM (
                      WITH to_delete AS (
                        SELECT id FROM "${schema}".ai_embeddings
                        WHERE created_at < $1 AND (created_at, id) > ($2::timestamptz, $3::text)
                        ORDER BY created_at ASC, id ASC
                        LIMIT $4
                      )
                      DELETE FROM "${schema}".ai_embeddings
                      WHERE id IN (SELECT id FROM to_delete)
                      RETURNING created_at, id
                    ) AS deleted_rows
                    ORDER BY created_at ASC, id ASC
                  `;
                  params = [cutoff, lastCreatedAt, lastId ?? UUID_SENTINEL, BATCH_SIZE];
                }

                const result = await pool.query<{ created_at: Date; id: string }>(query, params);

                const deleted = result.rowCount ?? 0;

                // Log warning if first iteration deletes 0 rows (possible misconfiguration)
                if (iterations === 1 && deleted === 0) {
                  logger.warn(
                    { cutoff: cutoff.toISOString(), retentionDays },
                    'WARNING: Cleanup completed with 0 rows deleted - check retention days config'
                  );
                }

                if (deleted === 0) break;

                // Update cursor to the last row from this batch (via RETURNING)
                // Note: outer SELECT wraps DELETE RETURNING to guarantee order matches CTE ORDER BY
                // Use explicit column access and NULL guard on created_at
                const returnedRows = result.rows;
                const lastRow = returnedRows[returnedRows.length - 1];
                if (!lastRow || lastRow.created_at === null) {
                  logger.error({ iterations, totalDeleted }, 'CRITICAL: RETURNING produced NULL or empty row, aborting');
                  throw new Error('memory-cleanup: RETURNING produced NULL row, cursor cannot advance');
                }
                // toISOString() gives ms precision (3 digits). PostgreSQL timestamptz uses µs (6 digits).
                // Padding with zeros is safe: PostgreSQL will match the millisecond boundary.
                // This is deterministic — no row between ms timestamps will be skipped.
                lastCreatedAt = lastRow.created_at.toISOString().slice(0, -1) + '000';
                lastId = lastRow.id;

                totalDeleted += deleted;
                await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
              }

              logger.info(
                { deleted: totalDeleted, iterations },
                'CRITICAL: Cleanup de embeddings antiguos completado'
              );
            } catch (err) {
              const error = err instanceof Error ? err.message : String(err);
              logger.error(
                { deleted: totalDeleted, lastCreatedAt, lastId, iterations, error },
                'CRITICAL: Job failed after deleting some rows'
              );
              throw err;
            }
            break;
          }

          case 'audit-cleanup': {
            // 90-day rolling retention para ai_sql_audit. Tabla definida en
            // 19-ai-sql-audit.sql. Schema en public (la tabla se crea sin schema prefix).
            // Parámetro: 90 días fijos (no configurable vía env — la duración está
            // documentada en design.md §3.3 como decisión de diseño).
            //
            // BATCHING: mirror del patrón memory-cleanup (líneas 86-258). Sin batching
            // un único DELETE mantendría un ACCESS EXCLUSIVE lock durante toda la
            // operación, bloqueando los INSERTs concurrentes de withReadOnlyRole.writeAuditRow
            // (que es best-effort pero igual es ruido operacional bajo carga).
            const schema = (config.db?.schema || 'public').trim();
            if (!config.allowedSchemas.includes(schema)) {
              logger.error({ schema, allowedSchemas: config.allowedSchemas }, 'CRITICAL: Invalid schema for audit-cleanup, skipping');
              break;
            }

            const BATCH_SIZE_STR = process.env.AUDIT_CLEANUP_BATCH_SIZE || '1000';
            const BATCH_SIZE = parseInt(BATCH_SIZE_STR, 10);
            if (isNaN(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 10000) {
              logger.error({ BATCH_SIZE, raw: BATCH_SIZE_STR }, 'CRITICAL: Invalid AUDIT_CLEANUP_BATCH_SIZE (must be 1-10000), skipping');
              break;
            }

            const BATCH_DELAY_MS_STR = process.env.AUDIT_CLEANUP_BATCH_DELAY_MS || '100';
            const BATCH_DELAY_MS = parseInt(BATCH_DELAY_MS_STR, 10);
            if (isNaN(BATCH_DELAY_MS) || BATCH_DELAY_MS < 0 || BATCH_DELAY_MS > 10000) {
              logger.error({ BATCH_DELAY_MS, raw: BATCH_DELAY_MS_STR }, 'CRITICAL: Invalid AUDIT_CLEANUP_BATCH_DELAY_MS, skipping');
              break;
            }

            const MAX_ITERATIONS_STR = process.env.AUDIT_CLEANUP_MAX_ITERATIONS || '360';
            const MAX_ITERATIONS = parseInt(MAX_ITERATIONS_STR, 10);
            if (isNaN(MAX_ITERATIONS) || MAX_ITERATIONS < 1) {
              logger.error({ MAX_ITERATIONS, raw: MAX_ITERATIONS_STR }, 'CRITICAL: Invalid AUDIT_CLEANUP_MAX_ITERATIONS, skipping');
              break;
            }

            const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

            let totalDeleted = 0;
            // Composite cursor (created_at, id). id es BIGSERIAL — usamos
            // casting a bigint para que la comparación tuple (created_at, id) > (cursor)
            // funcione correctamente. El índice idx_ai_sql_audit_created_at
            // (definido en 19-ai-sql-audit.sql) soporta el ORDER BY created_at ASC.
            let lastCreatedAt: string | null = null;
            let lastId: string | null = null;
            let iterations = 0;

            logger.info(
              { schema, cutoff: cutoff.toISOString(), BATCH_SIZE, MAX_ITERATIONS },
              'CRITICAL: Iniciando cleanup de ai_sql_audit antiguos'
            );

            try {
              while (true) {
                iterations++;

                if (iterations > MAX_ITERATIONS) {
                  logger.warn(
                    { iterations, totalDeleted, maxIterations: MAX_ITERATIONS },
                    'CRITICAL: audit-cleanup interrumpido — alcanzó max iteraciones (posible backlog)'
                  );
                  break;
                }

                let query: string;
                let params: unknown[];

                if (lastCreatedAt === null) {
                  // First batch: from the oldest rows (no cursor yet)
                  query = `
                    SELECT created_at, id FROM (
                      WITH to_delete AS (
                        SELECT id FROM "${schema}".ai_sql_audit
                        WHERE created_at < $1
                        ORDER BY created_at ASC, id ASC
                        LIMIT $2
                      )
                      DELETE FROM "${schema}".ai_sql_audit
                      WHERE id IN (SELECT id FROM to_delete)
                      RETURNING created_at, id
                    ) AS deleted_rows
                    ORDER BY created_at ASC, id ASC
                  `;
                  params = [cutoff, BATCH_SIZE];
                } else {
                  // Subsequent batches: composite cursor
                  query = `
                    SELECT created_at, id FROM (
                      WITH to_delete AS (
                        SELECT id FROM "${schema}".ai_sql_audit
                        WHERE created_at < $1 AND (created_at, id) > ($2::timestamptz, $3::bigint)
                        ORDER BY created_at ASC, id ASC
                        LIMIT $4
                      )
                      DELETE FROM "${schema}".ai_sql_audit
                      WHERE id IN (SELECT id FROM to_delete)
                      RETURNING created_at, id
                    ) AS deleted_rows
                    ORDER BY created_at ASC, id ASC
                  `;
                  params = [cutoff, lastCreatedAt, lastId ?? '0', BATCH_SIZE];
                }

                const result = await pool.query<{ created_at: Date; id: string }>(query, params);
                const deleted = result.rowCount ?? 0;

                if (iterations === 1 && deleted === 0) {
                  logger.info(
                    { cutoff: cutoff.toISOString() },
                    'CRITICAL: audit-cleanup completado sin filas a borrar'
                  );
                }

                if (deleted === 0) break;

                const returnedRows = result.rows;
                const lastRow = returnedRows[returnedRows.length - 1];
                if (!lastRow || lastRow.created_at === null) {
                  logger.error({ iterations, totalDeleted }, 'CRITICAL: RETURNING produced NULL or empty row, aborting');
                  throw new Error('audit-cleanup: RETURNING produced NULL row, cursor cannot advance');
                }
                // Pad to µs precision (PostgreSQL uses 6 digits, JS Date toISOString uses 3)
                lastCreatedAt = lastRow.created_at.toISOString().slice(0, -1) + '000';
                lastId = lastRow.id;

                totalDeleted += deleted;
                await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
              }

              if (totalDeleted > 0) {
                logger.info(
                  { deleted: totalDeleted, iterations },
                  'CRITICAL: Limpieza de ai_sql_audit completada'
                );
              }
            } catch (err) {
              const error = err instanceof Error ? err.message : String(err);
              logger.error(
                { deleted: totalDeleted, lastCreatedAt, lastId, iterations, error },
                'CRITICAL: audit-cleanup job failed after deleting some rows'
              );
              throw err;
            }
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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error({ task: name, error: errorMessage }, '💥 Error en Critical Worker');
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
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ type, to, error: errorMessage }, '💥 Error en Notification Worker');
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
