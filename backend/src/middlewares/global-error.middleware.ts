/**
 * Global Error Handler Middleware
 * Phase 3: Error Handling SDD
 * 
 * Catches ALL unhandled errors and:
 * 1. Sends notifications to Slack/Datadog
 * 2. Returns consistent error response to client
 * 3. Logs the error server-side
 */

import { Request, Response, NextFunction } from 'express';

import { notificationService } from '../services/notification.service';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

// ============================================================================
// Error classification
// ============================================================================

type ErrorCode =
  | 'INTERNAL_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'SERVICE_UNAVAILABLE';

function getErrorCode(error: Error, statusCode: number): ErrorCode {
  if (error instanceof AppError) {
    // Map AppError status codes to error codes
    switch (statusCode) {
      case 400: return 'VALIDATION_ERROR';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 429: return 'RATE_LIMIT';
      case 503: return 'SERVICE_UNAVAILABLE';
      default: return 'INTERNAL_ERROR';
    }
  }
  
  // Map error.name for non-AppError errors
  const errorName = error.name.toLowerCase();
  if (errorName === 'validationerror') return 'VALIDATION_ERROR';
  if (errorName === 'unauthorizederror') return 'UNAUTHORIZED';
  
  return 'INTERNAL_ERROR';
}

function getErrorMessage(error: Error): string {
  // SECURITY: Never expose error details to clients
  // Log details server-side for debugging
  
  if (error instanceof AppError) {
    return error.message;
  }
  
  // Generic messages for unknown errors
  return 'An internal error occurred. Please try again later.';
}

// ============================================================================
// Global Error Handler
// ============================================================================

/**
 * Express middleware to handle all unhandled errors
 * 
 * Usage in app.ts:
 * ```typescript
 * app.use(globalErrorHandler);
 * ```
 * 
 * This should be registered AFTER all routes
 */
export function globalErrorHandler(
  err: Error,
  req: Request & { id?: string },
  res: Response,
  _next: NextFunction
): void {
  // Extract requestId from middleware (set by tracking/requestId.middleware.ts)
  const requestId = req.id;
  
  // Determine status code
  let statusCode = 500;
  if (err instanceof AppError) {
    statusCode = err.statusCode;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
  }

  // Get error info
  const code = getErrorCode(err, statusCode);
  const message = getErrorMessage(err);

  // Build response (no PII to client)
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (requestId) {
    response.error.requestId = requestId;
  }

  // Log server-side (full details)
  logger.error(
    { 
      error: {
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      },
      request: {
        method: req.method,
        path: req.path,
        requestId,
      },
      code,
      statusCode,
    }, 
    'Unhandled error'
  );

  // Send notifications (async, don't block response)
  notificationService.notify(err, {
    requestId,
    path: req.path,
    method: req.method,
}).catch((notificationError) => {
  // SECURITY: Never log raw error objects — may contain request details, API keys, or file paths
  const errorMessage = notificationError instanceof Error 
    ? notificationError.message 
    : String(notificationError);
  logger.error({ service: 'notification', status: 'failed', message: errorMessage }, 'Failed to send error notification');
});

  // Send response to client
  res.status(statusCode).json(response);
}

// ============================================================================
// Async wrapper utility
// ============================================================================

/**
 * Wrapper for async route handlers to catch promise rejections
 * 
 * Usage:
 * ```typescript
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await UserService.getAll();
 *   res.json(users);
 * }));
 * ```
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}