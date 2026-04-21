import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

import { orchestratorErrorMiddleware } from '../../middlewares/orchestrator-error.middleware';
import { ValidationError, CapabilityNotFoundError, CapabilityExecutionError } from '../../services/orchestrator.service';

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('orchestrator-error.middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {};
    mockNext = vi.fn();
    mockRes = {
      status: statusMock,
      json: jsonMock,
    } as any;
  });

  describe('ValidationError', () => {
    it('should return 400 with ORCH_VALIDATION_ERROR code', () => {
      const error = new ValidationError('Missing required field: query', 'query');

      orchestratorErrorMiddleware(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'ORCH_VALIDATION_ERROR',
          message: 'Invalid request parameters', // Generic - no info leakage
          field: 'query',
        },
      });
    });
  });

  describe('CapabilityNotFoundError', () => {
    it('should return 404 with ORCH_CAPABILITY_NOT_FOUND code', () => {
      const error = new CapabilityNotFoundError('llm.chat');

      orchestratorErrorMiddleware(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'ORCH_CAPABILITY_NOT_FOUND',
          message: 'Capability not found', // Generic - no info leakage
          capability: 'llm.chat',
        },
      });
    });
  });

  describe('CapabilityExecutionError', () => {
    it('should return 500 with ORCH_EXECUTION_ERROR code', () => {
      const error = new CapabilityExecutionError('Handler timeout', 'llm.stream');

      orchestratorErrorMiddleware(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'ORCH_EXECUTION_ERROR',
          message: 'An error occurred while executing the capability', // Generic - no info leakage
          capability: 'llm.stream',
        },
      });
    });
  });

  describe('Generic Error', () => {
    it('should return 500 with ORCH_INTERNAL_ERROR code for unknown errors', () => {
      const error = new Error('Some unknown error');

      orchestratorErrorMiddleware(error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'ORCH_INTERNAL_ERROR',
          message: 'An internal error occurred while processing the request',
        },
      });
    });
  });
});