/**
 * Orchestrator Error Middleware
 * Phase 2: Orchestrator SDD
 * 
 * Handles Orchestrator-specific errors and returns JSON responses
 */

import { Request, Response, NextFunction } from 'express';

import { ValidationError, CapabilityNotFoundError, CapabilityExecutionError } from '../services/orchestrator.service';

/**
 * Error response format
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    capability?: string;
    field?: string;
  };
}

/**
 * Map error types to HTTP status codes and error codes
 */
function getErrorInfo(error: Error): { statusCode: number; code: string; message: string } {
  // SECURITY: Do NOT expose error.message to clients
  // Log details server-side for debugging
  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      code: 'ORCH_VALIDATION_ERROR',
      message: 'Invalid request parameters',
    };
  }

  if (error instanceof CapabilityNotFoundError) {
    return {
      statusCode: 404,
      code: 'ORCH_CAPABILITY_NOT_FOUND',
      message: 'Capability not found',
    };
  }

  if (error instanceof CapabilityExecutionError) {
    return {
      statusCode: 500,
      code: 'ORCH_EXECUTION_ERROR',
      message: 'An error occurred while executing the capability',
    };
  }

  // Generic error
  return {
    statusCode: 500,
    code: 'ORCH_INTERNAL_ERROR',
    message: 'An internal error occurred while processing the request',
  };
}

/**
 * Express middleware to handle Orchestrator errors
 * 
 * This middleware should be registered AFTER all orchestrator routes
 * to catch any errors thrown during capability execution.
 * 
 * @example
 * ```typescript
 * app.use('/api/orchestrator', orchestratorRoutes);
 * app.use(orchestratorErrorMiddleware);
 * ```
 */
export function orchestratorErrorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const { statusCode, code, message } = getErrorInfo(err);

  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };

  // Add capability context if available
  if (err instanceof CapabilityNotFoundError) {
    response.error.capability = err.capability;
  }

  if (err instanceof CapabilityExecutionError) {
    response.error.capability = err.capability;
  }

  if (err instanceof ValidationError) {
    response.error.field = err.field;
  }

  res.status(statusCode).json(response);
}
