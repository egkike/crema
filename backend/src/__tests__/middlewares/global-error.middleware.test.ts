/**
 * Global Error Handler Middleware tests
 * 
 * Pattern: vi.mock() at top → import after → vi.spyOn() for real methods
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock FIRST (Vitest hoists vi.mock)
vi.mock('../../services/notification.service', () => ({
  notificationService: {
    notify: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import AFTER mocks
import { AppError } from '../../errors/AppError';
import { globalErrorHandler, asyncHandler, ErrorResponse } from '../../middlewares/global-error.middleware';
import { notificationService } from '../../services/notification.service';
import logger from '../../utils/logger';

describe('globalErrorHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });

    mockReq = {
      method: 'POST',
      path: '/api/test',
    } as Partial<Request>;

    mockRes = {
      status: statusSpy,
      json: jsonSpy,
    } as Partial<Response>;

    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // AppError handling
  // -------------------------------------------------------------------------

  describe('AppError handling', () => {
    it('should handle AppError with correct status code', () => {
      const error = new AppError('User not found', 404);
      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'NOT_FOUND', message: 'User not found' }),
      }));
    });

    it('should handle AppError 400 as VALIDATION_ERROR', () => {
      const error = new AppError('Invalid input', 400);
      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }));
    });

    it('should handle AppError 401 as UNAUTHORIZED', () => {
      const error = new AppError('Not authenticated', 401);
      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }));
    });

    it('should handle AppError 403 as FORBIDDEN', () => {
      const error = new AppError('Access denied', 403);
      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      }));
    });

    it('should handle AppError 409 as CONFLICT', () => {
      const error = new AppError('Resource already exists', 409);
      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'CONFLICT' }),
      }));
    });

    it('should handle AppError 429 as RATE_LIMIT', () => {
      const error = new AppError('Too many requests', 429);
      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(429);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'RATE_LIMIT' }),
      }));
    });

    it('should handle AppError 503 as SERVICE_UNAVAILABLE', () => {
      const error = new AppError('Service down', 503);
      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(503);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }),
      }));
    });
  });

  // -------------------------------------------------------------------------
  // unknown error handling
  // -------------------------------------------------------------------------

  describe('unknown error handling', () => {
    it('should return 500 for unknown errors', () => {
      const error = new Error('Something went wrong');
      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred. Please try again later.',
        }),
      }));
    });

    it('should NOT expose error details to client for unknown errors', () => {
      const error = new Error('Database connection failed: password=secret123');
      Object.defineProperty(error, 'name', { value: 'DatabaseError' });

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      const response = jsonSpy.mock.calls[0][0] as ErrorResponse;
      expect(response.error.message).not.toContain('password=secret123');
      expect(response.error.message).toBe('An internal error occurred. Please try again later.');
    });

    it('should handle ValidationError (name-based)', () => {
      const error = new Error('Invalid data');
      Object.defineProperty(error, 'name', { value: 'ValidationError' });

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }));
    });

    it('should handle UnauthorizedError (name-based)', () => {
      const error = new Error('Not logged in');
      Object.defineProperty(error, 'name', { value: 'UnauthorizedError' });

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }));
    });
  });

  // -------------------------------------------------------------------------
  // request ID handling
  // -------------------------------------------------------------------------

  describe('request ID handling', () => {
    it('should include requestId in response when available', () => {
      const error = new AppError('Test error', 500);
      (mockReq as Request & { id?: string }).id = 'req-123-abc';

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ requestId: 'req-123-abc' }),
      }));
    });

    it('should NOT include requestId when not available', () => {
      const error = new AppError('Test error', 500);
      (mockReq as Request & { id?: string }).id = undefined;

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      const response = jsonSpy.mock.calls[0][0] as ErrorResponse;
      expect(response.error.requestId).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // logging
  // -------------------------------------------------------------------------

  describe('logging', () => {
    it('should log error with full details server-side', () => {
      const error = new Error('Test error');
      Object.defineProperty(error, 'name', { value: 'TestError' });
      Object.defineProperty(error, 'stack', { value: 'Error\n    at test.js:1' });

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ name: 'TestError', message: 'Test error' }),
          request: expect.objectContaining({ method: 'POST', path: '/api/test' }),
          code: 'INTERNAL_ERROR',
          statusCode: 500,
        }),
        'Unhandled error'
      );
    });

    it('should NOT include stack in production', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const error = new Error('Test error');
      Object.defineProperty(error, 'name', { value: 'TestError' });

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      const logCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(logCall.error.stack).toBeUndefined();
      process.env.NODE_ENV = prevEnv;
    });

    it('should log with stack in development mode', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');
      Object.defineProperty(error, 'name', { value: 'TestError' });
      Object.defineProperty(error, 'stack', { value: 'Error stack trace' });

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      const logCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(logCall.error.stack).toBe('Error stack trace');
      process.env.NODE_ENV = prevEnv;
    });
  });

  // -------------------------------------------------------------------------
  // notification
  // -------------------------------------------------------------------------

  describe('notification', () => {
    it('should send notification for errors', async () => {
      const error = new Error('Test error');
      Object.defineProperty(error, 'name', { value: 'TestError' });
      (mockReq as Request & { id?: string }).id = 'req-456';

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      // Wait for async notification
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(notificationService.notify).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ requestId: 'req-456', path: '/api/test', method: 'POST' })
      );
    });

    it('should not block response while notifying', () => {
      const error = new Error('Test error');

      globalErrorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      // Response sent immediately
      expect(statusSpy).toHaveBeenCalled();
      expect(jsonSpy).toHaveBeenCalled();
    });
  });
});

// -------------------------------------------------------------------------
// asyncHandler
// -------------------------------------------------------------------------

describe('asyncHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as Partial<Response>;
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  it('should pass resolved value to next', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = asyncHandler(handler);

    await wrapped(mockReq as Request, mockRes as Response, mockNext);

    expect(handler).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should catch errors and pass to next', async () => {
    const testError = new Error('Async error');
    const handler = vi.fn().mockRejectedValue(testError);
    const wrapped = asyncHandler(handler);

    await wrapped(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(testError);
  });
});