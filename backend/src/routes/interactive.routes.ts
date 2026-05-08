import { Router, Request, Response } from 'express';

import { toString } from '../utils/params.util';
import { interactiveAgentService } from '../services/ai/interactive-agent.service';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { validate } from '../middlewares/auth/validate.middleware';
import { interactiveAgentLimiter } from '../middlewares/rateLimit/rateLimit';
import { asyncHandler } from '../middlewares/global-error.middleware';
import {
  createFieldConfigSchema,
  createFieldInputSchema,
  updateFieldInputSchema,
} from '../schemas/interactive.schema';
import { AppError } from '../errors/AppError';

const router = Router();

// Helper to get user ID with proper null check
const uid = (req: Request): string => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }
  return req.user.id;
};

// Module key validation regex (matches SPEC)
const MODULE_KEY_REGEX = /^[a-z0-9_]+$/;

// S1: UUID format validation for defense-in-depth
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateModuleKey(moduleKey: string): void {
  if (!MODULE_KEY_REGEX.test(moduleKey)) {
    throw new AppError('INTERACTIVE_INVALID_MODULE', 400);
  }
}

function validateUUID(param: string, name: string): string {
  if (!UUID_REGEX.test(param)) {
    throw new AppError(`Invalid ${name} format`, 400);
  }
  return param;
}

// ============================================
// Field Config Routes (Creator)
// ============================================

/**
 * POST /api/interactive/fields/:productId
 * Create/update field configurations for a module.
 * Access: CREATOR only.
 */
router.post(
  '/fields/:productId',
  jwtAuthMiddleware,
  restrictTo('CREATOR'),
  validate(createFieldConfigSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = uid(req);
    const productId = validateUUID(toString(req.params.productId), 'productId');
    const { moduleKey, fields } = req.body;

    await interactiveAgentService.createFields(productId, userId, moduleKey, fields);

    res.json({ success: true });
  })
);

/**
 * GET /api/interactive/fields/:productId
 * Get field configurations for a product.
 * Access: JWT (owner or buyer).
 */
router.get('/fields/:productId', jwtAuthMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = uid(req);
  const productId = validateUUID(toString(req.params.productId), 'productId');

  const modules = await interactiveAgentService.getFields(productId, userId);

  res.json({ success: true, data: { modules } });
}));

// ============================================
// User Data Routes (Buyer)
// ============================================

/**
 * POST /api/interactive/data/:productId
 * Save user data for a module (first save — consumes 1 credit).
 * Access: JWT (buyer with active order).
 * Rate limited: 10/min (interactiveAgentLimiter).
 */
router.post(
  '/data/:productId',
  jwtAuthMiddleware,
  interactiveAgentLimiter,
  validate(createFieldInputSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = uid(req);
    const productId = validateUUID(toString(req.params.productId), 'productId');
    const { moduleKey, inputData } = req.body;

    const savedAt = await interactiveAgentService.saveUserData(productId, userId, moduleKey, inputData);

    res.json({ success: true, savedAt });
  })
);

/**
 * PUT /api/interactive/data/:productId/:moduleKey
 * Update existing user data (no credit charge).
 * Access: JWT (buyer with active order).
 * Rate limited: 10/min (interactiveAgentLimiter).
 */
router.put(
  '/data/:productId/:moduleKey',
  jwtAuthMiddleware,
  interactiveAgentLimiter,
  validate(updateFieldInputSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = uid(req);
    const productId = validateUUID(toString(req.params.productId), 'productId');
    const moduleKey = toString(req.params.moduleKey);
    validateModuleKey(moduleKey);
    const { inputData } = req.body;

    const savedAt = await interactiveAgentService.updateUserData(productId, userId, moduleKey, inputData);

    res.json({ success: true, savedAt });
  })
);

/**
 * GET /api/interactive/data/:productId
 * Get user's saved data for a product.
 * Access: JWT (buyer with active order).
 */
router.get('/data/:productId', jwtAuthMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = uid(req);
  const productId = validateUUID(toString(req.params.productId), 'productId');
  const moduleKey = typeof req.query.moduleKey === 'string' ? req.query.moduleKey : undefined;

  // S2: Validate moduleKey query param format
  if (moduleKey && (moduleKey.length > 100 || !MODULE_KEY_REGEX.test(moduleKey))) {
    throw new AppError('INTERACTIVE_INVALID_MODULE', 400);
  }

  const modules = await interactiveAgentService.getUserData(productId, userId, moduleKey);

  res.json({ success: true, data: { modules } });
}));

// ============================================
// Analysis Routes (Buyer)
// ============================================

/**
 * POST /api/interactive/analyze/:productId/:moduleKey
 * Request AI analysis for a completed module.
 * Access: JWT (buyer with active order).
 * Rate limited: 10/min (interactiveAgentLimiter).
 * Cost: 3 credits.
 */
router.post(
  '/analyze/:productId/:moduleKey',
  jwtAuthMiddleware,
  interactiveAgentLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = uid(req);
    const productId = validateUUID(toString(req.params.productId), 'productId');
    const moduleKey = toString(req.params.moduleKey);
    validateModuleKey(moduleKey);

    const result = await interactiveAgentService.analyzeData(productId, userId, moduleKey);

    res.json({ success: true, data: result });
  })
);

// ============================================
// Analytics Routes (Creator)
// ============================================

/**
 * GET /api/interactive/analytics/:productId
 * Get aggregated analytics for a product.
 * Access: CREATOR only.
 * Returns anonymized data — no personal information.
 */
router.get(
  '/analytics/:productId',
  jwtAuthMiddleware,
  restrictTo('CREATOR'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = uid(req);
    const productId = validateUUID(toString(req.params.productId), 'productId');

    const analytics = await interactiveAgentService.getAnalytics(productId, userId);

    res.json({ success: true, data: analytics });
  })
);

export default router;
