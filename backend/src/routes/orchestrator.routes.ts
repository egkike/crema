import { Router, Request, Response, NextFunction } from 'express';

import { configService } from '../services/config.service';
import { orchestratorService } from '../services/orchestrator.service';
import { skillsRegistry } from '../services/skills-registry.service';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { orchestratorErrorMiddleware } from '../middlewares/orchestrator-error.middleware';
import { ValidationError } from '../services/orchestrator.service';
import { aiLimiter } from '../middlewares/rateLimit/rateLimit';
import logger from '../utils/logger';
import type { AuthenticatedRequest } from '../types/express';

const router = Router();

/**
 * GET /api/orchestrator/capabilities
 * List all available capabilities (public)
 */
router.get('/capabilities', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const capabilities = await orchestratorService.listCapabilities();

    res.json({
      success: true,
      data: {
        capabilities,
        count: capabilities.length,
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    next(err);
  }
});

/**
 * GET /api/orchestrator/skills
 * List all available skills (public)
 */
router.get('/skills', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const skills = await skillsRegistry.listAll();

    res.json({
      success: true,
      data: {
        skills,
        count: skills.length,
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    next(err);
  }
});

/**
 * POST /api/orchestrator/query
 * Execute a capability query (protected)
 * Rate limited: aiLimiter applies
 */
router.post(
  '/query',
  jwtAuthMiddleware,
  aiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { capability, input } = req.body;

      // Validate capability
      if (!capability || typeof capability !== 'string') {
        throw new ValidationError('Capability is required and must be a string', 'capability');
      }

      // Validate capability length
      if (capability.length > 100) {
        throw new ValidationError('Capability name too long (max 100 characters)', 'capability');
      }

      // Validate input is a plain object
      // NOTE: Input is passed to AI service handlers (LLM, Embedding) which process as text context only.
      // Input is NOT rendered as HTML, NOT concatenated in SQL, NOT executed as code.
      // Each handler validates its own structure (e.g., validateLLMInput for LLM).
      if (!input || typeof input !== 'object' || Array.isArray(input) || input === null) {
        throw new ValidationError('Input must be a non-empty object', 'input');
      }

      const userId = (req as AuthenticatedRequest).user?.id;

      const result = await orchestratorService.executeQuery(capability, {
        userId,
        input,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message, capability: req.body.capability }, 'Endpoint error');
      next(err);
    }
  }
);

/**
 * GET /api/orchestrator/stream
 * SSE streaming endpoint for real-time responses (protected)
 * Only supports llm.stream capability
 */
router.get(
  '/stream',
  jwtAuthMiddleware,
  aiLimiter,
  async (req: Request, res: Response) => {
    const { capability, input } = req.query;

    // Validate capability query param
    if (!capability || typeof capability !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'ORCH_VALIDATION_ERROR',
          message: 'Invalid request',
        },
      });
      return;
    }

    // Only llm.stream supports streaming
    if (capability !== 'llm.stream') {
      res.status(400).json({
        success: false,
        error: {
          code: 'ORCH_INVALID_CAPABILITY',
          message: 'Operation not supported',
        },
      });
      return;
    }

    // Parse input from query string with size limit
    let parsedInput: Record<string, unknown>;
    const inputStr = typeof input === 'string' ? input : '';
    
    // SECURITY: Limit input size to prevent DoS
    if (inputStr.length > 10000) {
      res.status(400).json({
        success: false,
        error: {
          code: 'ORCH_VALIDATION_ERROR',
          message: 'Request too large',
        },
      });
      return;
    }

    try {
      parsedInput = inputStr ? JSON.parse(inputStr) as Record<string, unknown> : {};
    } catch {
      res.status(400).json({
        success: false,
        error: {
          code: 'ORCH_VALIDATION_ERROR',
          message: 'Invalid request format',
        },
      });
      return;
    }

    // Set SSE headers with protocol compliance
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // Get timeout for dynamic Retry-After header (default 60s, clamped 10s-5min)
    const rawTimeout = await configService.getNumber('orchestrator.stream_timeout', 60000);
    const timeoutMs = Math.min(Math.max(rawTimeout, 10000), 300000);
    res.setHeader('Retry-After', Math.ceil(timeoutMs / 1000).toString());

    const userId = (req as AuthenticatedRequest).user?.id;

    // Create AbortController for cancellation on client disconnect
    const controller = new AbortController();
    const { signal } = controller;

    // Handle client disconnect - abort stream and cleanup
    const onClose = () => {
      if (!signal.aborted) {
        controller.abort();
        logger.debug({ capability, userId }, 'Stream: client disconnected');
      }
    };
    req.on('close', onClose);

    try {
      // Protocol handshake - send empty comment for SSE clients
      res.write(': \n\n');
      
      // Use streaming execution with onChunk callback and abort signal
      const result = await orchestratorService.executeStream(
        capability,
        { ...parsedInput, userId },
        signal,
        (chunk: string) => {
          // Check if client disconnected or aborted before writing
          if (!res.writableEnded && !signal.aborted) {
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          }
        }
      );

      // Check if still connected before sending final result
      if (!res.writableEnded) {
        if (result.success) {
          res.write(`data: ${JSON.stringify({ done: true, result: result.data })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ done: true, error: result.error })}\n\n`);
        }
        res.end();
      }
    } catch (error: unknown) {
      // SECURITY: Log full error internally, expose generic message to client
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message, capability }, 'Stream error');
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true, error: 'Stream execution failed' })}\n\n`);
        res.end();
      }
    } finally {
      // Cleanup: remove close listener to prevent memory leak
      req.off('close', onClose);
    }
  }
);

// Error middleware - must be last
router.use(orchestratorErrorMiddleware);

export default router;