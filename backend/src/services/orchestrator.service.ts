/**
 * Orchestrator Service
 * Phase 2: Orchestrator SDD
 * Executes AI skills/capabilities with validation, timeout, and structured responses
 * 
 * Security features:
 * - Error messages sanitized (no internal details exposed to caller)
 * - Input cloning (no mutation of caller's objects)
 * - Capability validation (safe for logs)
 * - Timeout clamping (1s-5min)
 */

import logger from '../utils/logger';

import { skillsRegistry, Skill, SkillParameter } from './skills-registry.service';
import { configService } from './config.service';

/**
 * Input validation error
 */
export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Streaming callback type for SSE responses
 */
export type StreamChunkCallback = (chunk: string) => void;

/**
 * Context passed to handlers for streaming support
 */
export interface OrchestratorContext {
  userId?: string;
  onChunk?: StreamChunkCallback;
  signal?: AbortSignal;
}

/**
 * Capability not found error
 */
export class CapabilityNotFoundError extends Error {
  constructor(public readonly capability: string) {
    super(`Capability not found: ${capability}`);
    this.name = 'CapabilityNotFoundError';
  }
}

/**
 * Capability execution error
 */
export class CapabilityExecutionError extends Error {
  constructor(
    message: string,
    public readonly capability: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CapabilityExecutionError';
  }
}

/**
 * Structured response from capability execution
 */
export interface OrchestratorResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  capability?: string;
}

/**
 * Metadata for a capability (returned by listCapabilities)
 */
export interface CapabilityMetadata {
  capability: string;
  name: string;
  description: string;
  parameters: SkillParameter[];
  options: Skill['options'];
}

// ============================================================================
// Validation helpers
// ============================================================================

/**
 * Validate capability name format (safe for logs)
 */
function isValidCapabilityName(capability: string): boolean {
  return /^[a-z][a-z0-9_.]*$/.test(capability);
}

/**
 * Validate input against skill parameters schema
 * Returns a NEW object with defaults applied (does NOT mutate original)
 */
function applyDefaultsAndValidate(
  input: unknown,
  parameters: SkillParameter[]
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) {
    const hasRequiredParams = parameters.some((p) => p.required);
    if (hasRequiredParams) {
      throw new ValidationError('Input must be an object');
    }
    return {};
  }

  const inputObj = input as Record<string, unknown>;
  // Clone to avoid mutation
  const result: Record<string, unknown> = { ...inputObj };

  for (const param of parameters) {
    const value = result[param.name];

    // Check required fields (including empty strings as invalid)
    if (value === undefined || value === '') {
      if (param.required) {
        throw new ValidationError(`Missing required field: ${param.name}`, param.name);
      }
      // Apply default if not provided
      if (param.default !== undefined) {
        result[param.name] = param.default;
      }
      continue;
    }

    // Validate type
    const expectedType = param.type;
    let actualType: string;

    if (Array.isArray(value)) {
      actualType = 'array';
    } else if (typeof value === 'object' && value !== null) {
      actualType = 'object';
    } else {
      actualType = typeof value;
    }

    if (actualType !== expectedType) {
      throw new ValidationError(
        `Invalid type for field '${param.name}': expected ${expectedType}, got ${actualType}`,
        param.name
      );
    }
  }

  return result;
}

// ============================================================================
// Service
// ============================================================================

/**
 * Orchestrator Service - executes registered capabilities
 */
export const orchestratorService = {
  /**
   * Execute a capability by finding handler and running with validated input
   */
  async executeQuery<TInput = unknown, TOutput = unknown>(
    capability: string,
    input: TInput
  ): Promise<OrchestratorResponse<TOutput>> {
    const startTime = Date.now();
    const safeCapability = isValidCapabilityName(capability) ? capability : '[invalid]';
    const logMeta = { capability: safeCapability };

    // Track state across try/catch for timeout detection
    const state = { timedOut: false, result: undefined as unknown };

    try {
      const skill = await skillsRegistry.findByCapability(capability);

      if (!skill) {
        logger.warn(logMeta, 'Orchestrator: capability not found');
        return {
          success: false,
          error: `Capability not found: ${capability}`,
          capability,
        };
      }

      // Validate input and apply defaults (returns new object)
      if (skill.parameters && skill.parameters.length > 0) {
        try {
          applyDefaultsAndValidate(input, skill.parameters);
        } catch (validationError) {
          if (validationError instanceof ValidationError) {
            logger.warn(
              { capability: safeCapability, error: validationError.message, field: validationError.field },
              'Orchestrator: validation failed'
            );
            return {
              success: false,
              error: validationError.message,
              capability,
            };
          }
          throw validationError;
        }
      }

      const handler = skill.handler;

      if (!handler) {
        logger.error(logMeta, 'Orchestrator: handler not registered');
        return {
          success: false,
          error: 'Handler not registered for this capability',
          capability,
        };
      }

      // Get timeout from config (default 30s, clamped 1s-5min)
      const rawTimeout = await configService.getNumber('orchestrator.default_timeout', 30000);
      const timeoutMs = Math.min(Math.max(rawTimeout, 1000), 300000);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          state.timedOut = true;
          reject(new CapabilityExecutionError('Handler timeout', capability));
        }, timeoutMs);
      });

      state.result = await Promise.race([
        handler(input as Parameters<typeof handler>[0], skill.options),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;

      logger.info(
        { capability: safeCapability, durationMs: duration, success: true },
        'Orchestrator: capability executed'
      );

      return {
        success: true,
        data: state.result as TOutput,
        capability,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log internal error details (NOT exposed to caller)
      const internalError =
        error instanceof Error ? error.message : String(error);

      logger.error(
        { capability: safeCapability, durationMs: duration, error: internalError },
        'Orchestrator: capability execution failed'
      );

      // Generic message to caller — no internal details
      return {
        success: false,
        error: state.timedOut
          ? 'Handler timeout exceeded'
          : 'An error occurred while executing the capability',
        capability,
      };
    }
  },

  /**
   * Execute a capability with streaming support
   * Calls the handler with an onChunk callback for SSE responses
   * Includes timeout and abort signal support
   */
  async executeStream(
    capability: string,
    input: unknown,
    signal: AbortSignal,
    onChunk: StreamChunkCallback
  ): Promise<OrchestratorResponse> {
    const safeCapability = isValidCapabilityName(capability) ? capability : '[invalid]';
    const logMeta = { capability: safeCapability };

    // Get timeout from config (default 60s for streaming, clamped 10s-5min)
    const rawTimeout = await configService.getNumber('orchestrator.stream_timeout', 60000);
    const timeoutMs = Math.min(Math.max(rawTimeout, 10000), 300000);

    try {
      const skill = await skillsRegistry.findByCapability(capability);

      if (!skill) {
        logger.warn(logMeta, 'Orchestrator: capability not found for streaming');
        // SECURITY: Generic error message - don't expose capability names
        return {
          success: false,
          error: 'Capability not available',
        };
      }

      // Check if streaming is supported
      if (!skill.options?.streaming) {
        logger.warn({ ...logMeta, supported: false }, 'Orchestrator: capability does not support streaming');
        return {
          success: false,
          error: 'Capability not available',
        };
      }

      const handler = skill.handler;

      if (!handler) {
        logger.error(logMeta, 'Orchestrator: handler not registered');
        return {
          success: false,
          error: 'Handler not registered',
        };
      }

      // Pass onChunk and signal to handler via context
      const context: OrchestratorContext = {
        onChunk,
        signal,
        userId: (input as { userId?: string })?.userId,
      };

      // Execute with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new CapabilityExecutionError('Stream timeout', capability));
        }, timeoutMs);
        signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
      });

      const result = await Promise.race([
        handler(input, context),
        timeoutPromise,
      ]);

      return {
        success: true,
        data: result,
        capability,
      };
    } catch (error: unknown) {
      // Check if this was an abort (client disconnect) - not an actual error
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'CancellationError')) {
        logger.info(logMeta, 'Orchestrator: stream aborted by client');
        return {
          success: false,
          error: 'Stream aborted',
        };
      }

      // Handle timeout race condition
      if (signal.aborted) {
        logger.info(logMeta, 'Orchestrator: stream aborted during execution');
        return {
          success: false,
          error: 'Stream aborted',
        };
      }

      const internalError = error instanceof Error ? error.message : String(error);

      logger.error(
        { capability: safeCapability, error: internalError },
        'Orchestrator: streaming capability execution failed'
      );

      // SECURITY: Generic error message - don't expose capability
      return {
        success: false,
        error: 'Stream execution failed',
      };
    }
  },

  /**
   * List all registered capabilities with metadata
   */
  async listCapabilities(): Promise<CapabilityMetadata[]> {
    try {
      const skills = await skillsRegistry.listAll();

      return skills.map((skill) => ({
        capability: skill.capability,
        name: skill.name,
        description: skill.description,
        parameters: skill.parameters,
        options: skill.options,
      }));
    } catch (error) {
      logger.error(
        { error: String(error) },
        'Orchestrator: failed to list capabilities'
      );
      return [];
    }
  },
};