import { Router, Request, Response } from 'express';
import type { RequestHandler } from 'express';

import logger from '../utils/logger';
import pool from '../db/postgres';
import { getValidatedSchema } from '../utils/validators.util';
import { verifyProductOwnership, verifyProductAccess } from '../utils/routeHelpers.util';
import { toString, parseClamped, parseDate } from '../utils/params.util';
import { aiCreditService } from '../services/ai/credits.service';
import { memoryService } from '../services/ai/memory.service';
import { qaService } from '../services/ai/qa.service';
import { reviewService } from '../services/ai/review.service';
import { reportService } from '../services/ai/denunciation.service';
import { qaAgentService, analyticsService, tutorService, insightsService } from '../services/ai/agents.service';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { aiLimiter, aiChatLimiter } from '../middlewares/rateLimit/rateLimit';
import { validate } from '../middlewares/auth/validate.middleware';
import { AppError } from '../errors/AppError';
import type { AuthenticatedRequest } from '../types/express';
import type { EmbeddingSourceType } from '../types/ai.types';
import { PaymentProviderFactory } from '../services/payment/PaymentProviderFactory';
import { configRepository } from '../repositories/config.repository';
// Zod schemas for input validation
import {
  purchaseCreditsSchema,
  createQuestionSchema,
  answerQuestionSchema,
  voteQuestionSchema,
  publishQuestionSchema,
  createFAQSchema,
  updateFAQSchema,
  reorderFAQsSchema,
  createReviewSchema,
  updateReviewSchema,
  voteReviewSchema,
  updateReviewSettingsSchema,
  createReportSchema,
  resolveReportSchema,
  reportActionSchema,
  updateQAConfigSchema,
  updateTutorConfigSchema,
  createEmbeddingSchema,
  createDashboardSchema,
  updateDashboardSchema,
  insightsQuerySchema,
  chatMessageSchema,
  qaChatSchema,
} from '../schemas/ai.schema';

// Helper to cast middlewares to Express RequestHandler type
const asMw = (fn: unknown): RequestHandler => fn as RequestHandler;

// Helper to get user ID with proper null check - throws if user not authenticated
// The jwtAuthMiddleware ensures req.user is set for protected routes
const uid = (req: Request): string => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }
  return req.user.id;
};

const router = Router();

// ============================================
// Credit Routes (Protected)
// ============================================

/**
 * GET /api/ai/credits
 * Get user's credit balance
 */
router.get('/credits', jwtAuthMiddleware, aiLimiter, async (req: Request, res: Response) => {
  
  try {
    const userId = uid(req);
    const { balance, expiresAt } = await aiCreditService.getBalance(userId);

    res.json({
      success: true,
      data: {
        balance,
        expires_at: expiresAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/credits/packages
 * Get available credit packages
 */
router.get('/credits/packages', aiLimiter, async (_req: Request, res: Response) => {
  try {
    const packages = await aiCreditService.getPackages();

    res.json({
      success: true,
      data: { packages },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/credits/purchase
 * Purchase a credit package - initiates payment flow
 */
router.post('/credits/purchase', jwtAuthMiddleware, aiLimiter, validate(purchaseCreditsSchema), async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);
    const { packageId, currency = 'ARS', gatewayId } = req.body;

    // Get package details
    const pkg = await aiCreditService.getPackageById(packageId);
    
    if (!pkg) {
      throw new AppError('Credit package not found', 404);
    }

    if (!pkg.is_active) {
      throw new AppError('This credit package is not available', 400);
    }

    // Determine price based on currency (supports ARS, USD, USDT, etc.)
    // Default to ARS price if currency not matched, prefer USDT over USD if available
    let price: number;
    if (currency === 'ARS') {
      price = pkg.price_ars ?? 0;
    } else if (['USD', 'USDT'].includes(currency)) {
      price = pkg.price_usd ?? 0;
    } else {
      price = pkg.price_ars ?? pkg.price_usd ?? 0;
    }
    
    if (!price || price <= 0) {
      throw new AppError('Package price not available for this currency', 400);
    }

    // Get available gateways for this currency and determine which to use
    const allowedGateways = await configRepository.getGatewaysByCurrency(currency);
    
    if (allowedGateways.length === 0) {
      throw new AppError(`No payment gateways available for currency ${currency}`, 400);
    }

    // Use provided gatewayId if valid, otherwise use default for currency
    let selectedGateway: string;
    if (gatewayId) {
      if (!allowedGateways.some(g => g.id === gatewayId)) {
        throw new AppError(`Gateway ${gatewayId} not available for currency ${currency}`, 400);
      }
      selectedGateway = gatewayId;
    } else {
      // Use default gateway for this currency
      const defaultGateway = allowedGateways.find(g => g.is_default) || allowedGateways[0];
      selectedGateway = defaultGateway.id;
    }

    // Create payment preference
    const provider = PaymentProviderFactory.getProvider(selectedGateway);
    
    const creditData = {
      packageId: pkg.id,
      packageName: pkg.name,
      credits: pkg.credits,
      amount: price,
      currency,
      userId,
      email: req.user!.email,
    };

    // Check if provider supports credit preferences
    if (!('createCreditPreference' in provider) || !provider.createCreditPreference) {
      throw new AppError('Payment gateway does not support credit purchases', 400);
    }

    const paymentResponse = await provider.createCreditPreference(creditData);

    res.json({
      success: true,
      data: {
        init_point: paymentResponse.initPoint,
        package: {
          id: pkg.id,
          name: pkg.name,
          credits: pkg.credits,
          price,
          currency,
        },
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/credits/transactions
 * Get user's credit transaction history
 */
router.get('/credits/transactions', jwtAuthMiddleware, aiLimiter, async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);
    const limit = parseClamped(req.query.limit, 50, 1, 100);
    const offset = parseClamped(req.query.offset, 0, 0, 10000);

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
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

// ============================================
// Embedding Routes (Protected)
// ============================================

/**
 * POST /api/ai/embeddings
 * Create a new embedding
 */
router.post('/embeddings', asMw(jwtAuthMiddleware), validate(createEmbeddingSchema), async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);
    const { sourceType, sourceId, content, metadata } = req.body;

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
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/embeddings/search
 * Semantic search across embeddings (rate limited)
 */
router.get('/embeddings/search', jwtAuthMiddleware, aiLimiter, async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);
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
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * DELETE /api/ai/embeddings/:sourceType/:sourceId
 * Delete an embedding by source
 */
router.delete('/embeddings/:sourceType/:sourceId', jwtAuthMiddleware, async (req: Request, res: Response) => {
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
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

// ============================================
// Q&A Routes
// ============================================

/**
 * GET /api/ai/products/:productId/questions
 * Get questions for a product (public)
 */
router.get('/products/:productId/questions', aiLimiter, async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const limit = parseClamped(req.query.limit, 20, 1, 100);
    const offset = parseClamped(req.query.offset, 0, 0, 10000);
    const includeUnpublished = req.query.include_unpublished === 'true';
    const userId = (req as AuthenticatedRequest).user?.id;

    // Verify product ownership if user wants unpublished questions
    let showUnpublished = false;
    if (includeUnpublished && userId) {
      const productCheck = await pool.query(
        `SELECT id FROM "${getValidatedSchema()}"."products" WHERE id = $1 AND creator_id = $2`,
        [productId, userId]
      );
      showUnpublished = productCheck.rows.length > 0;
    }

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
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/products/:productId/questions
 * Ask a question on a product (authenticated)
 */
router.post('/products/:productId/questions', jwtAuthMiddleware, validate(createQuestionSchema), async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);
    const { question } = req.body;

    const result = await qaService.createQuestion(productId, userId, question);

    res.status(201).json({
      success: true,
      data: { question: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/questions/:questionId/answer
 * Answer a question (creator or admin)
 */
router.put('/questions/:questionId/answer', jwtAuthMiddleware, validate(answerQuestionSchema), async (req: Request, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);
    const answeredBy = uid(req);
    const { answer } = req.body;

    const result = await qaService.answerQuestion(questionId, answer, answeredBy);

    res.json({
      success: true,
      data: { question: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/questions/:questionId/publish
 * Toggle question publication (creator or admin)
 */
router.put('/questions/:questionId/publish', jwtAuthMiddleware, validate(publishQuestionSchema), async (req: Request, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);
    
    const userId = uid(req);
    const { is_published } = req.body;

    // Verify user owns the product this question belongs to
    const ownershipCheck = await pool.query(
      `SELECT q.id FROM "${getValidatedSchema()}".product_questions q
       JOIN "${getValidatedSchema()}".products p ON q.product_id = p.id
       WHERE q.id = $1 AND p.creator_id = $2`,
      [questionId, userId]
    );
    if (ownershipCheck.rows.length === 0) {
      throw new AppError('You do not have permission to publish this question', 403);
    }

    const result = await qaService.togglePublishQuestion(questionId, is_published);

    res.json({
      success: true,
      data: { question: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * DELETE /api/ai/questions/:questionId
 * Delete a question
 */
router.delete('/questions/:questionId', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);
    
    const userId = uid(req);

    // Verify user owns the product this question belongs to
    const ownershipCheck = await pool.query(
      `SELECT q.id FROM "${getValidatedSchema()}".product_questions q
       JOIN "${getValidatedSchema()}".products p ON q.product_id = p.id
       WHERE q.id = $1 AND p.creator_id = $2`,
      [questionId, userId]
    );
    if (ownershipCheck.rows.length === 0) {
      throw new AppError('You do not have permission to delete this question', 403);
    }

    const deleted = await qaService.deleteQuestion(questionId);

    res.json({
      success: true,
      data: { deleted },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/questions/:questionId/vote
 * Vote on a question
 */
router.post('/questions/:questionId/vote', jwtAuthMiddleware, validate(voteQuestionSchema), async (req: Request, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);
    
    const userId = uid(req);
    const { vote_type } = req.body;

    const result = await qaService.voteQuestion(questionId, userId, vote_type);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * DELETE /api/ai/questions/:questionId/vote
 * Remove vote from a question
 */
router.delete('/questions/:questionId/vote', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const questionId = toString(req.params.questionId);
    
    const userId = uid(req);

    const result = await qaService.removeVote(questionId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

// ============================================
// FAQ Routes
// ============================================

/**
 * GET /api/ai/products/:productId/faqs
 * Get FAQs for a product (public)
 */
router.get('/products/:productId/faqs', aiLimiter, async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const includeInactive = req.query.include_inactive === 'true';

    const faqs = await qaService.getFAQs(productId, includeInactive);

    res.json({
      success: true,
      data: { faqs },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/products/:productId/faqs
 * Create a FAQ (creator or admin)
 */
router.post('/products/:productId/faqs', jwtAuthMiddleware, validate(createFAQSchema), async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const { question, answer, sort_order } = req.body;

    const result = await qaService.createFAQ(productId, question, answer, sort_order);

    res.status(201).json({
      success: true,
      data: { faq: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/faqs/:faqId
 * Update a FAQ (creator or admin)
 */
router.put('/faqs/:faqId', jwtAuthMiddleware, validate(updateFAQSchema), async (req: Request, res: Response) => {
  try {
    const faqId = toString(req.params.faqId);
    
    const userId = uid(req);
    const { question, answer, sort_order, is_active } = req.body;

    // Verify user owns the product this FAQ belongs to
    const ownershipCheck = await pool.query(
      `SELECT f.id FROM "${getValidatedSchema()}".product_faqs f
       JOIN "${getValidatedSchema()}".products p ON f.product_id = p.id
       WHERE f.id = $1 AND p.creator_id = $2`,
      [faqId, userId]
    );
    if (ownershipCheck.rows.length === 0) {
      throw new AppError('You do not have permission to modify this FAQ', 403);
    }

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
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * DELETE /api/ai/faqs/:faqId
 * Delete a FAQ (creator or admin)
 */
router.delete('/faqs/:faqId', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const faqId = toString(req.params.faqId);
    
    const userId = uid(req);

    // Verify user owns the product this FAQ belongs to
    const ownershipCheck = await pool.query(
      `SELECT f.id FROM "${getValidatedSchema()}".product_faqs f
       JOIN "${getValidatedSchema()}".products p ON f.product_id = p.id
       WHERE f.id = $1 AND p.creator_id = $2`,
      [faqId, userId]
    );
    if (ownershipCheck.rows.length === 0) {
      throw new AppError('You do not have permission to delete this FAQ', 403);
    }

    const deleted = await qaService.deleteFAQ(faqId);

    res.json({
      success: true,
      data: { deleted },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/products/:productId/faqs/reorder
 * Reorder FAQs for a product (creator or admin)
 */
router.put('/products/:productId/faqs/reorder', jwtAuthMiddleware, validate(reorderFAQsSchema), async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const { faq_ids } = req.body;

    await qaService.reorderFAQs(productId, faq_ids);

    res.json({
      success: true,
      data: { message: 'FAQs reordered successfully' },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

// ============================================
// Review Routes
// ============================================

/**
 * GET /api/ai/products/:productId/reviews
 * Get reviews for a product (public)
 */
router.get('/products/:productId/reviews', aiLimiter, async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const limit = parseClamped(req.query.limit, 20, 1, 100);
    const offset = parseClamped(req.query.offset, 0, 0, 10000);
    const includeUnpublished = req.query.include_unpublished === 'true';

    const { reviews, total, avgRating } = await reviewService.getReviews(productId, includeUnpublished, limit, offset);

    res.json({
      success: true,
      data: {
        reviews,
        total,
        avg_rating: avgRating,
        limit,
        offset,
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/products/:productId/reviews
 * Create a review (authenticated)
 */
router.post('/products/:productId/reviews', jwtAuthMiddleware, validate(createReviewSchema), async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);
    const { rating, title, content } = req.body;

    const result = await reviewService.createReview(productId, userId, rating, content, title);

    res.status(201).json({
      success: true,
      data: { review: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/reviews/:reviewId
 * Update a review
 */
router.put('/reviews/:reviewId', jwtAuthMiddleware, validate(updateReviewSchema), async (req: Request, res: Response) => {
  try {
    const reviewId = toString(req.params.reviewId);
    
    const userId = uid(req);
    const { rating, title, content, is_published } = req.body;

    // Verify user owns the product this review belongs to
    const ownershipCheck = await pool.query(
      `SELECT r.id FROM "${getValidatedSchema()}".product_reviews r
       JOIN "${getValidatedSchema()}".products p ON r.product_id = p.id
       WHERE r.id = $1 AND p.creator_id = $2`,
      [reviewId, userId]
    );
    if (ownershipCheck.rows.length === 0) {
      throw new AppError('You do not have permission to modify this review', 403);
    }

    const result = await reviewService.updateReview(reviewId, {
      rating,
      title,
      content,
      isPublished: is_published,
    });

    res.json({
      success: true,
      data: { review: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * DELETE /api/ai/reviews/:reviewId
 * Delete a review
 */
router.delete('/reviews/:reviewId', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const reviewId = toString(req.params.reviewId);
    
    const userId = uid(req);

    // Verify user owns the product this review belongs to
    const ownershipCheck = await pool.query(
      `SELECT r.id FROM "${getValidatedSchema()}".product_reviews r
       JOIN "${getValidatedSchema()}".products p ON r.product_id = p.id
       WHERE r.id = $1 AND p.creator_id = $2`,
      [reviewId, userId]
    );
    if (ownershipCheck.rows.length === 0) {
      throw new AppError('You do not have permission to delete this review', 403);
    }

    const deleted = await reviewService.deleteReview(reviewId);

    res.json({
      success: true,
      data: { deleted },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/reviews/:reviewId/vote
 * Vote on a review
 */
router.post('/reviews/:reviewId/vote', jwtAuthMiddleware, validate(voteReviewSchema), async (req: Request, res: Response) => {
  try {
    const reviewId = toString(req.params.reviewId);
    
    const userId = uid(req);
    const { vote_type } = req.body;

    const result = await reviewService.voteReview(reviewId, userId, vote_type);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * DELETE /api/ai/reviews/:reviewId/vote
 * Remove vote from a review
 */
router.delete('/reviews/:reviewId/vote', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const reviewId = toString(req.params.reviewId);
    
    const userId = uid(req);

    const result = await reviewService.removeVote(reviewId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/products/:productId/reviews/settings
 * Get review settings for a product
 */
router.get('/products/:productId/reviews/settings', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);

    // Verify product ownership using helper
    await verifyProductOwnership(pool, productId, userId);

    const settings = await reviewService.getSettings(productId);

    res.json({
      success: true,
      data: { settings },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/products/:productId/reviews/settings
 * Update review settings for a product
 */
router.put('/products/:productId/reviews/settings', jwtAuthMiddleware, validate(updateReviewSettingsSchema), async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);
    const { allow_reviews, require_verified_purchase, auto_publish, min_rating, max_rating } = req.body;

    // Verify product ownership using helper
    await verifyProductOwnership(pool, productId, userId);

    const result = await reviewService.updateSettings(productId, {
      allowReviews: allow_reviews,
      requireVerifiedPurchase: require_verified_purchase,
      autoPublish: auto_publish,
      minRating: min_rating,
      maxRating: max_rating,
    });

    res.json({
      success: true,
      data: { settings: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/products/:productId/reviews/distribution
 * Get rating distribution for a product
 */
router.get('/products/:productId/reviews/distribution', aiLimiter, async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);

    const distribution = await reviewService.getRatingDistribution(productId);

    res.json({
      success: true,
      data: { distribution },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

// ============================================
// Report Routes (Denunciations)
// ============================================

/**
 * GET /api/ai/reports/reasons?contentType=product
 * Get available report reasons for a content type
 */
router.get('/reports/reasons', aiLimiter, async (req: Request, res: Response) => {
  try {
    const contentType = req.query.contentType as string;

    if (!contentType) {
      throw new AppError('contentType query parameter is required', 400);
    }

    const reasons = await reportService.getReasons(contentType);

    res.json({
      success: true,
      data: { reasons },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/reports
 * Create a new report (authenticated)
 */
router.post('/reports', jwtAuthMiddleware, validate(createReportSchema), async (req: Request, res: Response) => {
  try {
    const reporterId = uid(req);
    const { content_type, content_id, reason_code, description } = req.body;

    const result = await reportService.createReport(reporterId, content_type, content_id, reason_code, description);

    res.status(201).json({
      success: true,
      data: { report: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/reports
 * Get reports (admin)
 */
router.get('/reports', jwtAuthMiddleware, restrictTo('ADMIN'), async (req: Request, res: Response) => {
  try {
    const limit = parseClamped(req.query.limit, 20, 1, 100);
    const offset = parseClamped(req.query.offset, 0, 0, 10000);
    const status = req.query.status as string;
    const contentType = req.query.content_type as string;

    const { reports, total } = await reportService.getReports(
      { status, contentType },
      limit,
      offset
    );

    res.json({
      success: true,
      data: {
        reports,
        total,
        limit,
        offset,
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/reports/:reportId
 * Get a single report by ID (admin)
 */
router.get('/reports/:reportId', jwtAuthMiddleware, restrictTo('ADMIN'), async (req: Request, res: Response) => {
  try {
    const reportId = toString(req.params.reportId);

    const report = await reportService.getReportById(reportId);
    if (!report) {
      throw new AppError('Report not found', 404);
    }

    const actions = await reportService.getActions(reportId);

    res.json({
      success: true,
      data: { report, actions },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/reports/:reportId/resolve
 * Resolve a report (admin)
 */
router.put('/reports/:reportId/resolve', jwtAuthMiddleware, restrictTo('ADMIN'), validate(resolveReportSchema), async (req: Request, res: Response) => {
  try {
    const reportId = toString(req.params.reportId);
    const resolvedBy = uid(req);
    const { status, resolution_notes } = req.body;

    const result = await reportService.resolveReport(reportId, status, resolvedBy, resolution_notes);

    res.json({
      success: true,
      data: { report: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/reports/:reportId/actions
 * Apply action to a report (admin)
 */
router.post('/reports/:reportId/actions', jwtAuthMiddleware, restrictTo('ADMIN'), validate(reportActionSchema), async (req: Request, res: Response) => {
  try {
    const reportId = toString(req.params.reportId);
    const performedBy = uid(req);
    const { action_type, notes } = req.body;

    const validActions = ['warning', 'suspend', 'ban', 'delete_content', 'hide_content', 'no_action'];
    if (!validActions.includes(action_type)) {
      throw new AppError(`action_type must be one of: ${validActions.join(', ')}`, 400);
    }

    const result = await reportService.applyAction(reportId, action_type, performedBy, notes);

    res.json({
      success: true,
      data: { action: result },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/content/policies
 * Get content policies (public)
 */
router.get('/content/policies', aiLimiter, async (req: Request, res: Response) => {
  try {
    const contentType = req.query.content_type as string | undefined;

    const policies = await reportService.getPolicies(contentType);

    res.json({
      success: true,
      data: { policies },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

// ============================================
// Phase 5: AI Agents Routes
// ============================================

/**
 * GET /api/ai/products/:productId/qa-agent/config
 * Get QA agent config for a product
 */
router.get('/products/:productId/qa-agent/config', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);

    // Verify product ownership using helper
    await verifyProductOwnership(pool, productId, userId);

    const config = await qaAgentService.getConfig(productId);

    res.json({
      success: true,
      data: { config },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/products/:productId/qa-agent/config
 * Update QA agent config for a product
 */
router.put('/products/:productId/qa-agent/config', jwtAuthMiddleware, validate(updateQAConfigSchema), async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);
    const { is_enabled, model, system_prompt, temperature, max_tokens, use_memory, use_faqs } = req.body;

    // Verify product ownership using helper
    await verifyProductOwnership(pool, productId, userId);

    const config = await qaAgentService.updateConfig(productId, {
      isEnabled: is_enabled,
      model,
      systemPrompt: system_prompt,
      temperature,
      maxTokens: max_tokens,
      useMemory: use_memory,
      useFaqs: use_faqs,
    });

    res.json({
      success: true,
      data: { config },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/agents/qa/chat
 * Chat with QA agent (uses credits - rate limited)
 */
router.post('/agents/qa/chat', jwtAuthMiddleware, aiChatLimiter, validate(qaChatSchema), async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);
    const { product_id, message } = req.body;

    // Verify user has access to this product (creator, buyer, or affiliate)
    await verifyProductAccess(pool, product_id, userId);

    const result = await qaAgentService.chat(product_id, userId, message);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/agents/qa/chat/stream
 * SSE streaming for QA Agent
 */
router.post('/agents/qa/chat/stream', jwtAuthMiddleware, aiChatLimiter, validate(qaChatSchema), async (req: Request, res: Response) => {
  
    const userId = uid(req);
  const { product_id, message } = req.body;

  // Verify product access (creator, buyer, or affiliate) - can't throw AppError in SSE
  // We need to do the check inline since SSE headers already sent
  const schema = getValidatedSchema();
  
  // Check creator
  let hasAccess = false;
  const creatorCheck = await pool.query(
    `SELECT id FROM "${schema}".products WHERE id = $1 AND creator_id = $2`,
    [product_id, userId]
  );
  if (creatorCheck.rows.length > 0) hasAccess = true;
  
  // Check purchase
  if (!hasAccess) {
    const purchaseCheck = await pool.query(
      `SELECT id FROM "${schema}".orders WHERE product_id = $1 AND buyer_id = $2 AND status = 'completed'`,
      [product_id, userId]
    );
    if (purchaseCheck.rows.length > 0) hasAccess = true;
  }
  
  // Check affiliate
  if (!hasAccess) {
    const affiliateCheck = await pool.query(
      `SELECT id FROM "${schema}".affiliate_sales WHERE product_id = $1 AND affiliate_id = $2`,
      [product_id, userId]
    );
    if (affiliateCheck.rows.length > 0) hasAccess = true;
  }
  
  if (!hasAccess) {
    res.status(403).json({ error: 'You do not have access to this product. Purchase required.' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Create AbortController for cancellation
  const abortController = new AbortController();
  
  // Clean up on client disconnect
  req.on('close', () => {
    abortController.abort();
  });

  try {
    const cost = aiCreditService.getOperationCost('search');
    // Send start event
    sendSSE(res, 'start', { creditsUsed: cost });

    // Stream response
    await qaAgentService.chatStream(
      product_id,
      userId,
      message,
      // onChunk callback
      (chunk) => {
        sendSSE(res, 'chunk', { content: chunk, done: false });
      },
      abortController.signal
    );

    // Send done event
    sendSSE(res, 'done', { done: true });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'SSE stream error');

    // Handle specific errors
    if (err.message.includes('Créditos insuficientes')) {
      sendSSE(res, 'error', { code: 'INSUFFICIENT_CREDITS', message: err.message });
    } else if (err.name === 'AbortError') {
      sendSSE(res, 'done', { done: true, cancelled: true });
    } else {
      sendSSE(res, 'error', { code: 'LLM_ERROR', message: 'Error al generar respuesta' });
    }
  } finally {
    res.end();
  }
});

/**
 * Helper function to send SSE events
 */
function sendSSE(res: Response, event: string, data: Record<string, unknown>) {
  // Check if response is still writable (client may have disconnected)
  if (res.writableEnded) {
    return;
  }
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Silently ignore write errors (client disconnected)
  }
}

/**
 * GET /api/ai/agents/conversations
 * Get user's conversations
 */
router.get('/agents/conversations', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);
    const agentType = req.query.agent_type as string | undefined;
    const limit = parseClamped(req.query.limit, 20, 1, 100);

    const conversations = await qaAgentService.getUserConversations(userId, agentType, limit);

    res.json({
      success: true,
      data: { conversations },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/agents/conversations/:conversationId
 * Get a conversation with messages
 */
router.get('/agents/conversations/:conversationId', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const conversationId = toString(req.params.conversationId);
    
    const userId = uid(req);

    const result = await qaAgentService.getConversation(conversationId);
    if (!result) {
      throw new AppError('Conversation not found', 404);
    }

    // Verify ownership
    if (result.conversation.user_id !== userId) {
      throw new AppError('You do not have permission to view this conversation', 403);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

// ============================================
// Phase 6: Analytics Dashboard Routes
// ============================================

/**
 * GET /api/ai/analytics/dashboard
 * Get dashboard metrics for creator (rate limited)
 */
router.get('/analytics/dashboard', jwtAuthMiddleware, aiLimiter, async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);
    const startDate = parseDate(req.query.start_date);
    const endDate = parseDate(req.query.end_date);

    const metrics = await analyticsService.getDashboardMetrics(userId, startDate, endDate);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

// ============================================
// Phase 7: Advanced AI Routes (Tutor + Insights)
// ============================================

/**
 * GET /api/ai/products/:productId/tutor/config
 * Get tutor config for a product
 */
router.get('/products/:productId/tutor/config', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);

    // Verify product ownership using helper
    await verifyProductOwnership(pool, productId, userId);

    const config = await tutorService.getConfig(productId);

    res.json({
      success: true,
      data: { config },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/products/:productId/tutor/config
 * Update tutor config for a product
 */
router.put('/products/:productId/tutor/config', jwtAuthMiddleware, validate(updateTutorConfigSchema), async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);
    const { is_enabled, model, system_prompt, temperature, max_tokens } = req.body;

    // Verify product ownership using helper
    await verifyProductOwnership(pool, productId, userId);

    await tutorService.updateConfig(productId, {
      isEnabled: is_enabled,
      model,
      systemPrompt: system_prompt,
      temperature,
      maxTokens: max_tokens,
    });

    res.json({
      success: true,
      data: { message: 'Tutor config updated' },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * GET /api/ai/products/:productId/tutor/insights
 * Get insights for a user/product
 */
router.get('/products/:productId/tutor/insights', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);

    const result = await tutorService.getInsights(userId, productId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/products/:productId/tutor/chat
 * Chat with Tutor AI
 */
router.post('/products/:productId/tutor/chat', jwtAuthMiddleware, aiChatLimiter, validate(chatMessageSchema), async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    
    const userId = uid(req);
    const { message } = req.body;

    // Verify user has access to this product (creator, buyer, or affiliate)
    await verifyProductAccess(pool, productId, userId);

    const result = await tutorService.chat(productId, userId, message);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/products/:productId/tutor/chat/stream
 * SSE streaming for Tutor AI
 */
router.post('/products/:productId/tutor/chat/stream', jwtAuthMiddleware, aiChatLimiter, validate(chatMessageSchema), async (req: Request, res: Response) => {
  const productId = toString(req.params.productId);
  
    const userId = uid(req);
  const { message } = req.body;

  // Verify product access (creator, buyer, or affiliate) - can't throw AppError in SSE
  const schema = getValidatedSchema();
  
  let hasAccess = false;
  const creatorCheck = await pool.query(
    `SELECT id FROM "${schema}".products WHERE id = $1 AND creator_id = $2`,
    [productId, userId]
  );
  if (creatorCheck.rows.length > 0) hasAccess = true;
  
  if (!hasAccess) {
    const purchaseCheck = await pool.query(
      `SELECT id FROM "${schema}".orders WHERE product_id = $1 AND buyer_id = $2 AND status = 'completed'`,
      [productId, userId]
    );
    if (purchaseCheck.rows.length > 0) hasAccess = true;
  }
  
  if (!hasAccess) {
    const affiliateCheck = await pool.query(
      `SELECT id FROM "${schema}".affiliate_sales WHERE product_id = $1 AND affiliate_id = $2`,
      [productId, userId]
    );
    if (affiliateCheck.rows.length > 0) hasAccess = true;
  }
  
  if (!hasAccess) {
    res.status(403).json({ error: 'You do not have access to this product. Purchase required.' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const abortController = new AbortController();
  
  req.on('close', () => {
    abortController.abort();
  });

  try {
    const cost = aiCreditService.getOperationCost('search');
    sendSSE(res, 'start', { creditsUsed: cost });

    await tutorService.chatStream(
      productId,
      userId,
      message,
      (chunk) => {
        sendSSE(res, 'chunk', { content: chunk, done: false });
      },
      abortController.signal
    );

    sendSSE(res, 'done', { done: true });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Tutor SSE stream error');

    if (err.message.includes('Créditos insuficientes')) {
      sendSSE(res, 'error', { code: 'INSUFFICIENT_CREDITS', message: err.message });
    } else if (err.name === 'AbortError') {
      sendSSE(res, 'done', { done: true, cancelled: true });
    } else {
      sendSSE(res, 'error', { code: 'LLM_ERROR', message: 'Error generating response' });
    }
  } finally {
    res.end();
  }
});

/**
 * GET /api/ai/insights/dashboards
 * Get user's insight dashboards
 */
router.get('/insights/dashboards', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);

    const result = await insightsService.getDashboards(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/insights/dashboards
 * Create an insight dashboard
 */
router.post('/insights/dashboards', jwtAuthMiddleware, validate(createDashboardSchema), async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);
    const { name, description } = req.body;

    const result = await insightsService.createDashboard(userId, name, description);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * PUT /api/ai/insights/dashboards/:dashboardId
 * Update an insight dashboard
 */
router.put('/insights/dashboards/:dashboardId', jwtAuthMiddleware, validate(updateDashboardSchema), async (req: Request, res: Response) => {
  try {
    const dashboardId = toString(req.params.dashboardId);
    
    const userId = uid(req);
    const { name, description, config } = req.body;

    // Verify ownership
    const dashboard = await insightsService.getDashboardById(dashboardId);
    if (!dashboard) {
      throw new AppError('Dashboard not found', 404);
    }
    if (dashboard.creator_id !== userId) {
      throw new AppError('You do not have permission to modify this dashboard', 403);
    }

    await insightsService.updateDashboard(dashboardId, { name, description, config });

    res.json({
      success: true,
      data: { message: 'Dashboard updated' },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * DELETE /api/ai/insights/dashboards/:dashboardId
 * Delete an insight dashboard
 */
router.delete('/insights/dashboards/:dashboardId', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const dashboardId = toString(req.params.dashboardId);
    
    const userId = uid(req);

    // Verify ownership
    const dashboard = await insightsService.getDashboardById(dashboardId);
    if (!dashboard) {
      throw new AppError('Dashboard not found', 404);
    }
    if (dashboard.creator_id !== userId) {
      throw new AppError('You do not have permission to delete this dashboard', 403);
    }

    const deleted = await insightsService.deleteDashboard(dashboardId);

    res.json({
      success: true,
      data: { deleted },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/insights/query
 * Query data with AI (rate limited - uses credits)
 */
router.post('/insights/query', jwtAuthMiddleware, aiChatLimiter, validate(insightsQuerySchema), async (req: Request, res: Response) => {
  try {
    
    const userId = uid(req);
    const { query } = req.body;

    const result = await insightsService.query(userId, query);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Endpoint error');
    throw new AppError('Internal server error', 500);
  }
});

/**
 * POST /api/ai/insights/query/stream
 * Query data with AI using SSE streaming
 */
router.post('/insights/query/stream', jwtAuthMiddleware, aiChatLimiter, validate(insightsQuerySchema), async (req: Request, res: Response) => {
  
    const userId = uid(req);
  const { query } = req.body;

  // Verify user has creator-level access (has at least one product)
  // Platform-wide insights: users can only query their own data (service filters by creator_id)
  const schema = getValidatedSchema();
  const productCheck = await pool.query(
    `SELECT id FROM "${schema}".products WHERE creator_id = $1 LIMIT 1`,
    [userId]
  );
  if (productCheck.rows.length === 0) {
    res.status(403).json({ error: 'You must be a creator with at least one product to use insights.' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const abortController = new AbortController();
  
  req.on('close', () => {
    abortController.abort();
  });

  try {
    const cost = aiCreditService.getOperationCost('generate_insight');
    sendSSE(res, 'start', { creditsUsed: cost });

    await insightsService.chatStream(
      userId,
      query,
      (chunk, type) => {
        sendSSE(res, 'chunk', { content: chunk, type, done: false });
      },
      abortController.signal
    );

    sendSSE(res, 'done', { done: true });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    logger.error({ error: err.message }, 'Insights SSE stream error');

    if (err.message.includes('Créditos insuficientes')) {
      sendSSE(res, 'error', { code: 'INSUFFICIENT_CREDITS', message: err.message });
    } else if (err.name === 'AbortError') {
      sendSSE(res, 'done', { done: true, cancelled: true });
    } else {
      sendSSE(res, 'error', { code: 'LLM_ERROR', message: 'Error al procesar consulta' });
    }
  } finally {
    res.end();
  }
});

export default router;
