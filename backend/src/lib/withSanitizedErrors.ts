/**
 * Wraps a DB call so that low-level driver / query errors do not leak
 * internal details (constraint names, table names, stack traces) to clients.
 *
 * Behavior:
 *   - `AppError` (4xx operational errors) is re-thrown untouched so the
 *     client-facing message stays specific.
 *   - Any other `Error` is logged server-side with `{ op, userId, err }`
 *     (full detail) and re-thrown as a generic `AppError('Error al ejecutar la consulta', 500)`.
 *
 * Use for raw `pool.query` and other DB calls where the error message
 * could otherwise expose schema or constraint details.
 *
 * See docs/project/ai-features/sdd/fix-agents-service-gga-findings/design.md §2.2.
 */
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Executes `fn` and converts any non-`AppError` rejection into a generic 500.
 *
 * @param op     - Operation label for log correlation (e.g. 'predictChurn.studentQuery').
 * @param userId - Requesting user, included in the log line for traceability.
 * @param fn     - Async function performing the DB work.
 * @returns The resolved value of `fn`.
 * @throws  Re-throws `AppError` unchanged; otherwise throws `AppError('Error al ejecutar la consulta', 500)`.
 */
export async function withSanitizedErrors<T>(
  op: string,
  userId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    logger.error({ err: detail, op, userId }, 'DB error — sanitized for client');
    throw new AppError('Error al ejecutar la consulta', 500);
  }
}
