import { Router, Request, Response } from 'express';

import { aiCreditService } from '../services/ai/credits.service';
import { memoryService } from '../services/ai/memory.service';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { AppError } from '../errors/AppError';
import type { UserPayload } from '../types/express';
import type { EmbeddingSourceType } from '../types/ai.types';

const router = Router();

// Extend request type to include user
interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

// ============================================
// Credit Routes (Protected)
// ============================================

/**
 * GET /api/ai/credits
 * Get user's credit balance
 */
router.get('/credits', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { balance, expiresAt } = await aiCreditService.getBalance(userId);

    res.json({
      success: true,
      data: {
        balance,
        expires_at: expiresAt.toISOString(),
      },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/credits/packages
 * Get available credit packages
 */
router.get('/credits/packages', async (_req: Request, res: Response) => {
  try {
    const packages = await aiCreditService.getPackages();

    res.json({
      success: true,
      data: { packages },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/credits/purchase
 * Purchase a credit package
 */
router.post('/credits/purchase', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { packageId } = req.body;

    if (!packageId) {
      throw new AppError('Package ID is required', 400);
    }

    const result = await aiCreditService.purchasePackage(userId, packageId);

    res.json({
      success: true,
      data: {
        new_balance: result.newBalance,
        transaction: result.transaction,
      },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/credits/transactions
 * Get user's credit transaction history
 */
router.get('/credits/transactions', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const { transactions, total } = await aiCreditService.getTransactions(userId, limit, offset);

    res.json({
      success: true,
      data: {
        transactions,
        total,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

// ============================================
// Embedding Routes (Protected)
// ============================================

/**
 * POST /api/ai/embeddings
 * Create a new embedding
 */
router.post('/embeddings', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sourceType, sourceId, content, metadata } = req.body;

    if (!sourceType || !sourceId || !content) {
      throw new AppError('sourceType, sourceId, and content are required', 400);
    }

    // Validate source type
    const validTypes: EmbeddingSourceType[] = ['lesson', 'faq', 'policy', 'qa', 'review', 'insight', 'saved_dashboard'];
    if (!validTypes.includes(sourceType)) {
      throw new AppError(`Invalid sourceType. Must be one of: ${validTypes.join(', ')}`, 400);
    }

    const embedding = await memoryService.addEmbedding(userId, sourceType, sourceId, content, metadata);

    res.json({
      success: true,
      data: { embedding },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/embeddings/search
 * Semantic search across embeddings
 */
router.get('/embeddings/search', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { query, limit, sourceTypes } = req.query;

    if (!query) {
      throw new AppError('query parameter is required', 400);
    }

    const limitNum = parseInt(limit as string) || 10;
    const sourceTypesArr = sourceTypes 
      ? (sourceTypes as string).split(',') as EmbeddingSourceType[] 
      : undefined;

    const results = await memoryService.searchSimilar(
      userId,
      query as string,
      limitNum,
      sourceTypesArr
    );

    res.json({
      success: true,
      data: { results },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * DELETE /api/ai/embeddings/:sourceType/:sourceId
 * Delete an embedding by source
 */
router.delete('/embeddings/:sourceType/:sourceId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sourceType, sourceId } = req.params;

    // Validate source type - ensure it's a string
    const sourceTypeStr = Array.isArray(sourceType) ? sourceType[0] : sourceType;
    const sourceIdStr = Array.isArray(sourceId) ? sourceId[0] : sourceId;
    const validTypes: EmbeddingSourceType[] = ['lesson', 'faq', 'policy', 'qa', 'review', 'insight', 'saved_dashboard'];
    if (!validTypes.includes(sourceTypeStr as EmbeddingSourceType)) {
      throw new AppError(`Invalid sourceType. Must be one of: ${validTypes.join(', ')}`, 400);
    }

    const deleted = await memoryService.deleteEmbedding(sourceTypeStr as EmbeddingSourceType, sourceIdStr);

    res.json({
      success: true,
      data: { deleted },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

export default router;
