import { Router, Request, Response } from 'express';

import { aiCreditService } from '../services/ai/credits.service';
import { memoryService } from '../services/ai/memory.service';
import { qaService } from '../services/ai/qa.service';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { AppError } from '../errors/AppError';
import type { UserPayload } from '../types/express';
import type { EmbeddingSourceType } from '../types/ai.types';

const router = Router();

// Extend request type to include user
interface AuthenticatedRequest extends Request {
  user?: UserPayload;
}

// Helper to convert params to string (handle string | string[])
const toString = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0];
  return value || '';
};

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

// ============================================
// Q&A Routes
// ============================================

/**
 * GET /api/ai/products/:productId/questions
 * Get questions for a product (public)
 */
router.get('/products/:productId/questions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const includeUnpublished = req.query.include_unpublished === 'true';

    // Check if user is creator (can see unpublished)
    const isCreator = req.user && req.user.id;
    const showUnpublished = !!(isCreator && includeUnpublished);

    const { questions, total } = await qaService.getQuestions(productId, showUnpublished, limit, offset);

    res.json({
      success: true,
      data: {
        questions,
        total,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/products/:productId/questions
 * Ask a question on a product (authenticated)
 */
router.post('/products/:productId/questions', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const userId = req.user!.id;
    const { question } = req.body;

    if (!question) {
      throw new AppError('Question text is required', 400);
    }

    const result = await qaService.createQuestion(productId, userId, question);

    res.status(201).json({
      success: true,
      data: { question: result },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/questions/:questionId/answer
 * Answer a question (creator or admin)
 */
router.put('/questions/:questionId/answer', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);
    const answeredBy = req.user!.id;
    const { answer } = req.body;

    if (!answer) {
      throw new AppError('Answer text is required', 400);
    }

    const result = await qaService.answerQuestion(questionId, answer, answeredBy);

    res.json({
      success: true,
      data: { question: result },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/questions/:questionId/publish
 * Toggle question publication (creator or admin)
 */
router.put('/questions/:questionId/publish', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);
    const { is_published } = req.body;

    if (typeof is_published !== 'boolean') {
      throw new AppError('is_published boolean is required', 400);
    }

    const result = await qaService.togglePublishQuestion(questionId, is_published);

    res.json({
      success: true,
      data: { question: result },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * DELETE /api/ai/questions/:questionId
 * Delete a question
 */
router.delete('/questions/:questionId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);

    const deleted = await qaService.deleteQuestion(questionId);

    res.json({
      success: true,
      data: { deleted },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/questions/:questionId/vote
 * Vote on a question
 */
router.post('/questions/:questionId/vote', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);
    const userId = req.user!.id;
    const { vote_type } = req.body;

    if (!vote_type || !['helpful', 'not_helpful'].includes(vote_type)) {
      throw new AppError('vote_type must be "helpful" or "not_helpful"', 400);
    }

    const result = await qaService.voteQuestion(questionId, userId, vote_type);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * DELETE /api/ai/questions/:questionId/vote
 * Remove vote from a question
 */
router.delete('/questions/:questionId/vote', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);
    const userId = req.user!.id;

    const result = await qaService.removeVote(questionId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

// ============================================
// FAQ Routes
// ============================================

/**
 * GET /api/ai/products/:productId/faqs
 * Get FAQs for a product (public)
 */
router.get('/products/:productId/faqs', async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const includeInactive = req.query.include_inactive === 'true';

    const faqs = await qaService.getFAQs(productId, includeInactive);

    res.json({
      success: true,
      data: { faqs },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/products/:productId/faqs
 * Create a FAQ (creator or admin)
 */
router.post('/products/:productId/faqs', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const { question, answer, sort_order } = req.body;

    if (!question || !answer) {
      throw new AppError('question and answer are required', 400);
    }

    const result = await qaService.createFAQ(productId, question, answer, sort_order);

    res.status(201).json({
      success: true,
      data: { faq: result },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/faqs/:faqId
 * Update a FAQ (creator or admin)
 */
router.put('/faqs/:faqId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const faqId = toString(req.params.faqId);
    const { question, answer, sort_order, is_active } = req.body;

    const result = await qaService.updateFAQ(faqId, {
      question,
      answer,
      sortOrder: sort_order,
      isActive: is_active,
    });

    res.json({
      success: true,
      data: { faq: result },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * DELETE /api/ai/faqs/:faqId
 * Delete a FAQ (creator or admin)
 */
router.delete('/faqs/:faqId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const faqId = toString(req.params.faqId);

    const deleted = await qaService.deleteFAQ(faqId);

    res.json({
      success: true,
      data: { deleted },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/products/:productId/faqs/reorder
 * Reorder FAQs for a product (creator or admin)
 */
router.put('/products/:productId/faqs/reorder', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const { faq_ids } = req.body;

    if (!faq_ids || !Array.isArray(faq_ids)) {
      throw new AppError('faq_ids array is required', 400);
    }

    await qaService.reorderFAQs(productId, faq_ids);

    res.json({
      success: true,
      data: { message: 'FAQs reordered successfully' },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

export default router;
