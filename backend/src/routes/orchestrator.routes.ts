import { Router, Request, Response, NextFunction } from 'express';

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

// Error middleware - must be last
router.use(orchestratorErrorMiddleware);

export default router;