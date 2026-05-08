/**
 * Interactive Agent Repository
 * SDD: docs/project/ai-features/sdd/interactive-agent/
 * Handles field configuration, user data, and analytics persistence.
 */

import pool from '../../db/postgres';
import { getValidatedSchema } from '../../utils/validators.util';
import logger from '../../utils/logger';
import { AppError } from '../../errors/AppError';
import { fieldOptionsSchema, fieldValidationSchema, VALID_FIELD_TYPES } from '../../schemas/interactive.schema';

/**
 * Lazy schema getter — avoids calling getValidatedSchema() at module load time,
 * which crashes in test mode when config isn't fully initialized.
 */
const getSchema = (): string => getValidatedSchema();

// =========================================================================
// Analytics timeout constants
// =========================================================================

// Statement timeout: max duration for a single query within an analytics transaction
const ANALYTICS_STATEMENT_TIMEOUT = '10s'; // 10 seconds

// Idle timeout: max idle time in a transaction before PostgreSQL aborts
const ANALYTICS_IDLE_TIMEOUT = '30s'; // 30 seconds

// =========================================================================
// Safe serialization helpers
// =========================================================================

/**
 * Serialize to JSON with circular-reference protection and size guard.
 * Prevents TypeError: Converting circular structure to JSON crashes.
 * Circular keys are omitted entirely (returned as undefined) to avoid storing '[Circular]' as real data.
 * Catches BigInt/Function throws from JSON.stringify and re-throws as AppError.
 */
function safeStringify(val: unknown, maxSize = 1024 * 100): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val !== 'object') return JSON.stringify(val);
  try {
    const seen = new WeakSet<object>();
    const str = JSON.stringify(val, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          logger.warn({}, '[interactive-agent] Circular reference detected and omitted in safeStringify');
          return undefined;
        }
        seen.add(value);
      }
      return value;
    });
    if (Buffer.byteLength(str, 'utf-8') > maxSize) {
      throw new AppError('Serialized data exceeds maximum allowed size', 413);
    }
    return str;
  } catch (err) {
    // SUGGESTION-4 (Judge 1): Detect BigInt explicitly — JSON.stringify throws
    // TypeError: "Do not know how to serialize a BigInt" — give a clear 400 instead of 500.
    if (err instanceof TypeError && err.message.includes('BigInt')) {
      throw new AppError('Invalid data: BigInt values are not supported in JSON payloads', 400);
    }
    if (err instanceof AppError) throw err;
    throw new AppError('Failed to serialize data', 500);
  }
}

/**
 * Parse field_options from DB with Zod validation — rejects malformed data.
 */
function parseFieldOptions(
  val: unknown,
  fieldName?: string
): Array<{ value: string; label: string }> | undefined {
  if (val === null || val === undefined) return undefined;
  const result = fieldOptionsSchema.safeParse(val);
  if (!result.success) {
    logger.warn({ fieldName: fieldName || 'unknown', error: result.error.issues.map(i => i.message).join(', ') }, '[interactive-agent] Invalid field_options in DB — returning undefined');
    return undefined;
  }
  return result.data;
}

/**
 * Parse field_validation from DB with Zod validation — rejects malformed data.
 */
function parseFieldValidation(
  val: unknown,
  fieldName?: string
): Record<string, unknown> | undefined {
  if (val === null || val === undefined) return undefined;
  const result = fieldValidationSchema.safeParse(val);
  if (!result.success) {
    logger.warn({ fieldName: fieldName || 'unknown', error: result.error.issues.map(i => i.message).join(', ') }, '[interactive-agent] Invalid field_validation in DB — returning undefined');
    return undefined;
  }
  return result.data;
}

// =========================================================================
// Internal DB row types (snake_case columns)
// =========================================================================

interface FieldConfigRow {
  product_id: string;
  module_key: string;
  field_name: string;
  field_type: typeof VALID_FIELD_TYPES[number];
  field_label: string;
  field_placeholder: string | null;
  field_options: unknown; // Can be array, object, string, etc. in DB — parseFieldOptions handles validation
  field_required: boolean;
  field_validation: unknown; // JSONB can be any value — not just objects
  order_index: number;
  created_at: Date;
  updated_at: Date;
}

interface UserDataRow {
  id: string;
  user_id: string;
  product_id: string;
  module_key: string;
  input_data: Record<string, unknown>;
  output_analysis: Record<string, unknown> | null;
  completed: boolean;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface AggregatedStatsRow {
  total_responses: number;
  average_completion: number | null;
}

interface FieldStatRow {
  field_name: string;
  module_key: string;
  average: number | null;
  responses: number;
}

// =========================================================================
// Public return types (camelCase)
// =========================================================================

export interface FieldConfigReturn {
  moduleKey: string;
  fieldName: string;
  fieldType: 'number' | 'string' | 'boolean' | 'select';
  fieldLabel: string;
  fieldPlaceholder?: string;
  fieldOptions?: Array<{ value: string; label: string }>;
  fieldRequired: boolean;
  fieldValidation?: Record<string, unknown>; // Validated via parseFieldValidation — min, max, pattern
  orderIndex: number;
}

export interface UserDataRowReturn {
  id: string;
  userId: string;
  productId: string;
  moduleKey: string;
  inputData: Record<string, unknown>;
  outputAnalysis?: Record<string, unknown>;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AggregatedStats {
  totalResponses: number;
  averageCompletion: number;
  fieldStats: Array<{
    fieldName: string;
    moduleKey: string;
    average: number | null;
    responses: number;
  }>;
}

export interface UpsertResult {
  wasInsert: boolean;
}

// =========================================================================
// Repository
// =========================================================================

export const interactiveAgentRepository = {
  // =========================================================================
  // Fields (creator config)
  // =========================================================================

  /**
   * Find all field configurations for a product.
   * WARNING: Does NOT enforce access control. Callers MUST verify access via hasProductAccess
   * before invoking this method. If you call this without an access check, you expose all
   * field configs for the product to ANY authenticated user.
   * NOTE: Results are capped at 1000 — truncation may occur for products with many fields.
   * Read consistency during concurrent upsert is best-effort; a concurrent upsert may
   * produce a mixed snapshot. This is a known limitation.
   */
  async findFieldsByProduct(productId: string): Promise<FieldConfigReturn[]> {
    const query = `
      SELECT module_key, field_name, field_type, field_label, field_placeholder,
             field_options, field_required, field_validation, order_index
      FROM "${getSchema()}".product_module_fields
      WHERE product_id = $1
      ORDER BY module_key, order_index
      LIMIT 1000
    `;
    const { rows } = await pool.query<FieldConfigRow>(query, [productId]);
    if (rows.length === 1000) {
      logger.warn({ productId }, '[interactive-agent] findFieldsByProduct hit LIMIT 1000 — truncation may have occurred');
    }
    // Filter out rows with invalid field_type instead of throwing 500 on a single corrupt row
    return rows
      .filter((row) => {
        if (!VALID_FIELD_TYPES.includes(row.field_type)) {
          logger.warn({ field_name: row.field_name, field_type: row.field_type }, '[interactive-agent] Skipping row with invalid field_type');
          return false;
        }
        return true;
      })
      .map((row) => this.mapFieldConfigRow(row));
  },

  /**
   * Find field configurations for a specific module of a product.
   * More efficient than findFieldsByProduct when only one module is needed.
   */
  async findFieldsByModule(productId: string, moduleKey: string): Promise<FieldConfigReturn[]> {
    const query = `
      SELECT module_key, field_name, field_type, field_label, field_placeholder,
             field_options, field_required, field_validation, order_index
      FROM "${getSchema()}".product_module_fields
      WHERE product_id = $1 AND module_key = $2
      ORDER BY order_index
    `;
    const { rows } = await pool.query<FieldConfigRow>(query, [productId, moduleKey]);
    return rows
      .filter((row) => VALID_FIELD_TYPES.includes(row.field_type))
      .map((row) => this.mapFieldConfigRow(row));
  },

  /**
   * Upsert field configurations for a specific module.
   * Deletes existing fields for the module and inserts new ones.
   */
  async upsertFields(
    productId: string,
    moduleKey: string,
    fields: Array<{
      fieldName: string;
      fieldType: 'number' | 'string' | 'boolean' | 'select';
      fieldLabel: string;
      fieldPlaceholder?: string | null;
      fieldOptions?: Array<{ value: string; label: string }> | null;
      fieldRequired?: boolean;
      fieldValidation?: Record<string, unknown> | null;
      orderIndex?: number;
    }>
  ): Promise<void> {
    if (fields.length === 0) {
      throw new AppError('At least one field is required', 400);
    }
    if (fields.length > 50) throw new AppError('Maximum 50 fields per module', 400);

    // Defense-in-depth: validate fieldType and fieldName before any DB operation
    const FIELD_NAME_REGEX = /^[a-z0-9_]+$/;
    for (const field of fields) {
      if (!VALID_FIELD_TYPES.includes(field.fieldType)) {
        throw new AppError(`Invalid field type: ${field.fieldType}`, 400);
      }
      if (!FIELD_NAME_REGEX.test(field.fieldName)) {
        throw new AppError(`Invalid field name: ${field.fieldName}`, 400);
      }
      // Length checks that Zod validates but repo should also enforce
      if (field.fieldName.length > 100 || field.fieldLabel.length > 200) {
        throw new AppError('Field name or label exceeds maximum length', 400);
      }
    }

    // W2: Validate JSONB sizes BEFORE opening transaction to avoid generic 500 on rollback
    // S5: Serialize once, reuse for size check and INSERT
    const serializedFields = fields.map((field) => ({
      ...field,
      _serializedOptions: field.fieldOptions ? safeStringify(field.fieldOptions) : null,
      _serializedValidation: field.fieldValidation ? safeStringify(field.fieldValidation) : null,
    }));

    for (const field of serializedFields) {
      if (field._serializedOptions) {
        const size = Buffer.byteLength(field._serializedOptions, 'utf-8');
        if (size > 1024 * 100) throw new AppError('Field options exceed 100KB', 413);
      }
      if (field._serializedValidation) {
        const size = Buffer.byteLength(field._serializedValidation, 'utf-8');
        if (size > 1024 * 10) throw new AppError('Field validation exceeds 10KB', 413);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lockResult = await client.query(
        "SELECT pg_try_advisory_xact_lock(('x' || substr(md5($1 || $2), 1, 16))::bit(64)::bigint) AS acquired",
        [productId, moduleKey]
      );
      if (!lockResult.rows[0].acquired) {
        await client.query('ROLLBACK');
        throw new AppError('Resource temporarily locked — try again', 409);
      }

      // Delete existing fields for this module
      await client.query(
        `DELETE FROM "${getSchema()}".product_module_fields WHERE product_id = $1 AND module_key = $2`,
        [productId, moduleKey]
      );

      // Insert new fields using bulk INSERT
      if (fields.length > 0) {
        const placeholders = fields.map((_, i) => {
          const base = i * 10;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
        }).join(', ');

        const values = serializedFields.flatMap((field, i) => [
          productId,
          moduleKey,
          field.fieldName,
          field.fieldType,
          field.fieldLabel,
          field.fieldPlaceholder ?? null,
          field._serializedOptions ?? null,
          field.fieldRequired ?? false,
          field._serializedValidation ?? null,
          field.orderIndex ?? i,
        ]);

        await client.query(
          `INSERT INTO "${getSchema()}".product_module_fields (
            product_id, module_key, field_name, field_type, field_label,
            field_placeholder, field_options, field_required, field_validation, order_index
          ) VALUES ${placeholders}`,
          values
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      // Re-throw operational errors (e.g., 409 lock conflict) as-is
      if (err instanceof AppError) throw err;
      // Log original error details for diagnostics
      logger.error({
        err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
        productId,
        moduleKey,
        fieldCount: fields.length,
      }, '[interactive-agent] Failed to upsert field configurations');
      throw new AppError('Failed to upsert field configurations', 500, false);
    } finally {
      client.release();
    }
  },

  /**
   * Delete all field configurations for a specific module.
   *
   * @deprecated Not currently used. Reserved for future field deletion feature.
   * To activate: add DELETE /fields/:productId/:moduleKey route and service method.
   */
  async deleteFieldsByModule(productId: string, moduleKey: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lockResult = await client.query(
        "SELECT pg_try_advisory_xact_lock(('x' || substr(md5($1 || $2), 1, 16))::bit(64)::bigint) AS acquired",
        [productId, moduleKey]
      );
      if (!lockResult.rows[0].acquired) {
        await client.query('ROLLBACK');
        throw new AppError('Resource temporarily locked — try again', 409);
      }
      await client.query(
        `DELETE FROM "${getSchema()}".product_module_fields WHERE product_id = $1 AND module_key = $2`,
        [productId, moduleKey]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      // Log original error details for diagnostics
      logger.error({
        err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
        productId,
        moduleKey,
      }, '[interactive-agent] Failed to delete field configurations');
      throw new AppError('Failed to delete field configurations', 500, false);
    } finally {
      client.release();
    }
  },

  // =========================================================================
  // User data
  // =========================================================================

  /**
   * Check if user data exists for a product/module — lightweight existence check.
   * Avoids fetching full rows with JSONB columns just to check existence.
   */
  async userDataExists(userId: string, productId: string, moduleKey: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM "${getSchema()}".user_course_data
      WHERE user_id = $1 AND product_id = $2 AND module_key = $3
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [userId, productId, moduleKey]);
    return rows.length > 0;
  },

  /**
   * Find user data entries, optionally filtered by module.
   * Pagination uses configurable limit (capped at 500 for safety).
   */
  async findUserData(
    userId: string,
    productId: string,
    moduleKey?: string,
    offset: number = 0,
    limit: number = 100
  ): Promise<UserDataRowReturn[]> {
    let query = `
      SELECT id, user_id, product_id, module_key, input_data, output_analysis,
             completed, completed_at, created_at, updated_at
      FROM "${getSchema()}".user_course_data
      WHERE user_id = $1 AND product_id = $2
    `;
    const params: unknown[] = [userId, productId];

    // W14: Validate moduleKey format before using in query
    if (moduleKey && moduleKey.length > 0) {
      if (moduleKey.length > 100 || !/^[a-z0-9_]+$/.test(moduleKey)) {
        throw new AppError('Invalid module key format', 400);
      }
      query += ' AND module_key = $3';
      params.push(moduleKey);
    }

    // Guard against NaN/Infinity that would crash Math operations
    const safeOffset = Number.isFinite(offset) ? Math.min(Math.max(0, Math.floor(Number(offset))), 10000) : 0;
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(1, Math.floor(Number(limit))), 500) : 100;

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(safeLimit);
    if (safeOffset > 0) {
      params.push(safeOffset);
      query += ` OFFSET $${params.length}`;
    }

    const { rows } = await pool.query<UserDataRow>(query, params);
    return rows.map((row) => this.mapUserDataRow(row));
  },

  /**
   * Upsert user data for a module. Uses ON CONFLICT to update existing records.
   * Sets completed_at = NOW() when completed = true.
   *
   * JSONB merge semantics:
   * - input_data uses `existing || new` — PostgreSQL gives priority to the RIGHT operand,
   *   so new keys are added and existing keys are overwritten by the new values.
   * - Keys are never removed by this merge; accumulation is by design for partial updates.
   * - To remove keys, a full replacement would be needed (not currently supported).
   *
   * Returns { wasInsert: boolean } — true if a new row was inserted, false if existing was updated.
   * This allows callers to determine credit charging accurately.
   */
  async upsertUserData(
    userId: string,
    productId: string,
    moduleKey: string,
    inputData: Record<string, unknown>,
    outputAnalysis?: Record<string, unknown>,
    completed?: boolean
  ): Promise<{ wasInsert: boolean }> {
    // Defense-in-depth: check JSONB size before DB operation
    const serializedInput = safeStringify(inputData);
    const inputSize = Buffer.byteLength(serializedInput, 'utf-8');
    if (inputSize > 50 * 1024) throw new AppError('Input data exceeds 50KB limit', 400);

    // Size guard for output analysis
    if (outputAnalysis) {
      const analysisSize = Buffer.byteLength(safeStringify(outputAnalysis), 'utf-8');
      if (analysisSize > 1024 * 100) {
        throw new AppError('Output analysis exceeds 100KB limit', 400);
      }
    }

    const isCompleted = completed ?? false;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lockResult = await client.query(
        "SELECT pg_try_advisory_xact_lock(('x' || substr(md5($1 || $2 || $3), 1, 16))::bit(64)::bigint) AS acquired",
        [userId, productId, moduleKey]
      );
      if (!lockResult.rows[0].acquired) {
        await client.query('ROLLBACK');
        throw new AppError('Resource temporarily locked — try again', 409);
      }

      const query = `
        INSERT INTO "${getSchema()}".user_course_data (
          user_id, product_id, module_key, input_data, output_analysis, completed, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE NULL END)
        ON CONFLICT (user_id, product_id, module_key) DO UPDATE SET
          input_data = user_course_data.input_data || EXCLUDED.input_data,
          output_analysis = COALESCE(EXCLUDED.output_analysis, user_course_data.output_analysis),
          completed = EXCLUDED.completed,
          completed_at = CASE
            WHEN EXCLUDED.completed THEN COALESCE(user_course_data.completed_at, CURRENT_TIMESTAMP)
            ELSE user_course_data.completed_at  -- Preserve original timestamp, don't set NULL
          END
        RETURNING CASE WHEN xmax = 0 THEN true ELSE false END AS was_insert
      `;

      const { rows } = await client.query<{ was_insert: boolean }>(query, [
        userId,
        productId,
        moduleKey,
        serializedInput,
        outputAnalysis ? safeStringify(outputAnalysis) : null,
        isCompleted,
      ]);

      await client.query('COMMIT');

      return { wasInsert: rows[0]?.was_insert ?? false };
    } catch (err) {
      await client.query('ROLLBACK');
      // Re-throw operational errors (e.g., 409 lock conflict) as-is
      if (err instanceof AppError) throw err;
      // Log original error details for diagnostics
      logger.error({
        err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
        userId,
        productId,
        moduleKey,
      }, '[interactive-agent] Failed to upsert user data');
      throw new AppError('Failed to upsert user data', 500, false);
    } finally {
      client.release();
    }
  },

  // =========================================================================
  // Analytics (aggregated, no personal data)
  // =========================================================================

  /**
   * Get aggregated statistics for a product.
   * Uses a dedicated client with SET LOCAL statement_timeout to avoid polluting the connection pool.
   */
  async getAggregatedStats(productId: string): Promise<AggregatedStats> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // SET LOCAL only affects this transaction on this dedicated client
      await client.query(`SET LOCAL statement_timeout = '${ANALYTICS_STATEMENT_TIMEOUT}'`);
      await client.query(`SET LOCAL idle_in_transaction_session_timeout = '${ANALYTICS_IDLE_TIMEOUT}'`);

      // Overall stats
      const statsQuery = `
        SELECT COUNT(*) AS total_responses,
               AVG(CASE WHEN completed THEN 1.0 ELSE 0.0 END) AS average_completion
        FROM "${getSchema()}".user_course_data
        WHERE product_id = $1
      `;

      // Per-field stats (extract numeric values from input_data JSONB)
      // Safe cast: only average values that are actually numeric to prevent query crashes
      const fieldStatsQuery = `
        SELECT pmf.field_name, ucd.module_key,
               AVG(
                 CASE WHEN ucd.input_data ->> pmf.field_name ~ '^-?[[:digit:]]+(\\.[[:digit:]]+)?$'
                   THEN (ucd.input_data ->> pmf.field_name)::NUMERIC
                   ELSE NULL
                 END
               ) AS average,
               COUNT(*) FILTER (WHERE ucd.input_data ? pmf.field_name) AS responses
        FROM "${getSchema()}".product_module_fields pmf
        JOIN "${getSchema()}".user_course_data ucd
          ON ucd.product_id = pmf.product_id AND ucd.module_key = pmf.module_key
        WHERE pmf.product_id = $1
          AND pmf.field_type = 'number'
          AND ucd.input_data ? pmf.field_name
        GROUP BY pmf.field_name, ucd.module_key
        ORDER BY pmf.module_key, pmf.field_name
        LIMIT 10000
      `;

      // Run both queries sequentially on the same client within the transaction
      const statsResult = await client.query<AggregatedStatsRow>(statsQuery, [productId]);
      const fieldResult = await client.query<FieldStatRow>(fieldStatsQuery, [productId]);

      await client.query('COMMIT');

      const stats = statsResult.rows[0];
      const fieldRows = fieldResult.rows;

      return {
        totalResponses: Number(stats?.total_responses || 0),
        averageCompletion: stats?.average_completion !== null && stats?.average_completion !== undefined
          ? Number(stats.average_completion)
          : 0,
        fieldStats: fieldRows.map((row) => ({
          fieldName: row.field_name,
          moduleKey: row.module_key,
          average: row.average !== null ? Number(row.average) : null,
          responses: Number(row.responses || 0),
        })),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // Use PostgreSQL error code 57014 (query_canceled) instead of string matching
      if ((err as { code?: string }).code === '57014') {
        throw new AppError(`Analytics query timed out for product ${productId} — too much data`, 504);
      }
      // Always wrap in AppError with generic message, log original server-side
      logger.error({
        err: err instanceof Error ? { message: err.message, code: (err as { code?: string }).code } : String(err),
        productId,
      }, '[interactive-agent] Aggregated stats failed');
      throw new AppError(`Failed to compute analytics for product ${productId}`, 500, false);
    } finally {
      // Reset timeout before releasing client back to pool
      await client.query('RESET statement_timeout').catch(() => {});
      await client.query('RESET idle_in_transaction_session_timeout').catch(() => {});
      client.release();
    }
  },

  /**
   * Count distinct users and completed modules for a product in a single query.
   */
  async countUserStats(productId: string): Promise<{ distinctUsers: number; completedModules: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '${ANALYTICS_STATEMENT_TIMEOUT}'`);
      await client.query(`SET LOCAL idle_in_transaction_session_timeout = '${ANALYTICS_IDLE_TIMEOUT}'`);

      const query = `
        SELECT
          COUNT(DISTINCT user_id) AS distinct_users,
          COUNT(*) FILTER (WHERE completed) AS completed_modules
        FROM "${getSchema()}".user_course_data
        WHERE product_id = $1
      `;
      const { rows } = await client.query<{ distinct_users: string; completed_modules: string }>(query, [productId]);

      await client.query('COMMIT');

      return {
        distinctUsers: parseInt(rows[0]?.distinct_users || '0', 10),
        completedModules: parseInt(rows[0]?.completed_modules || '0', 10),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if ((err as { code?: string }).code === '57014') {
        throw new AppError(`Analytics query timed out for product ${productId} — too much data`, 504);
      }
      logger.error({
        err: err instanceof Error ? { message: err.message, code: (err as { code?: string }).code } : String(err),
        productId,
      }, '[interactive-agent] countUserStats failed');
      throw new AppError(`Failed to compute user statistics for product ${productId}`, 500, false);
    } finally {
      await client.query('RESET statement_timeout').catch(() => {});
      await client.query('RESET idle_in_transaction_session_timeout').catch(() => {});
      client.release();
    }
  },

  // =========================================================================
  // Access helpers
  // =========================================================================

  /**
   * Check if user has access to a product (creator or buyer with paid order).
   */
  async hasProductAccess(userId: string, productId: string): Promise<boolean> {
    const [isOwner, hasOrder] = await Promise.all([
      this.isProductOwner(userId, productId),
      this.hasActiveOrder(userId, productId),
    ]);
    return isOwner || hasOrder;
  },

  /**
   * Check if user is the product owner (creator).
   */
  async isProductOwner(userId: string, productId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM "${getSchema()}".products
      WHERE id = $1 AND creator_id = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [productId, userId]);
    return rows.length > 0;
  },

  /**
   * Check if user has an active (paid) order for the product.
   */
  async hasActiveOrder(userId: string, productId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM "${getSchema()}".orders
      WHERE product_id = $1 AND buyer_id = $2 AND status = 'paid'
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [productId, userId]);
    return rows.length > 0;
  },

  // =========================================================================
  // Helper mappers
  // =========================================================================

  /**
   * Map FieldConfigRow to camelCase return type.
   */
  mapFieldConfigRow(row: FieldConfigRow): FieldConfigReturn {
    if (!VALID_FIELD_TYPES.includes(row.field_type)) {
      logger.error({ field_type: row.field_type }, '[interactive-agent] Invalid field_type from DB');
      throw new AppError('Invalid field configuration in database', 500, false);
    }
    return {
      moduleKey: row.module_key,
      fieldName: row.field_name,
      fieldType: row.field_type,
      fieldLabel: row.field_label,
      fieldPlaceholder: row.field_placeholder ?? undefined,
      fieldOptions: parseFieldOptions(row.field_options, row.field_name),
      fieldRequired: row.field_required,
      fieldValidation: parseFieldValidation(row.field_validation, row.field_name),
      orderIndex: row.order_index,
    };
  },

  /**
   * Map UserDataRow to camelCase return type.
   */
  mapUserDataRow(row: UserDataRow): UserDataRowReturn {
    return {
      id: row.id,
      userId: row.user_id,
      productId: row.product_id,
      moduleKey: row.module_key,
      inputData: row.input_data,
      outputAnalysis: row.output_analysis ?? undefined,
      completed: row.completed,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },
};
