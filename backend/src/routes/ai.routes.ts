import { Router, Request, Response } from 'express';

import { aiCreditService } from '../services/ai/credits.service';
import { memoryService } from '../services/ai/memory.service';
import { qaService } from '../services/ai/qa.service';
import { reviewService } from '../services/ai/review.service';
import { reportService } from '../services/ai/denunciation.service';
import { qaAgentService, analyticsService, tutorService, insightsService } from '../services/ai/agents.service';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { aiLimiter, aiChatLimiter } from '../middlewares/rateLimit/rateLimit';
import { AppError } from '../errors/AppError';
import type { UserPayload } from '../types/express';
import type { EmbeddingSourceType } from '../types/ai.types';
import { PaymentProviderFactory } from '../services/payment/PaymentProviderFactory';
import { configRepository } from '../repositories/config.repository';

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
 * Purchase a credit package - initiates payment flow
 */
router.post('/credits/purchase', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { packageId, currency = 'ARS', gatewayId } = req.body;

    if (!packageId) {
      throw new AppError('Package ID is required', 400);
    }

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
 * Semantic search across embeddings (rate limited)
 */
router.get('/embeddings/search', jwtAuthMiddleware, aiLimiter, async (req: AuthenticatedRequest, res: Response) => {
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

// ============================================
// Review Routes
// ============================================

/**
 * GET /api/ai/products/:productId/reviews
 * Get reviews for a product (public)
 */
router.get('/products/:productId/reviews', async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
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
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/products/:productId/reviews
 * Create a review (authenticated)
 */
router.post('/products/:productId/reviews', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const userId = req.user!.id;
    const { rating, title, content } = req.body;

    if (!rating || !content) {
      throw new AppError('rating and content are required', 400);
    }

    if (rating < 1 || rating > 5) {
      throw new AppError('rating must be between 1 and 5', 400);
    }

    const result = await reviewService.createReview(productId, userId, rating, content, title);

    res.status(201).json({
      success: true,
      data: { review: result },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/reviews/:reviewId
 * Update a review
 */
router.put('/reviews/:reviewId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reviewId = toString(req.params.reviewId);
    const { rating, title, content, is_published } = req.body;

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
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * DELETE /api/ai/reviews/:reviewId
 * Delete a review
 */
router.delete('/reviews/:reviewId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reviewId = toString(req.params.reviewId);

    const deleted = await reviewService.deleteReview(reviewId);

    res.json({
      success: true,
      data: { deleted },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/reviews/:reviewId/vote
 * Vote on a review
 */
router.post('/reviews/:reviewId/vote', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reviewId = toString(req.params.reviewId);
    const userId = req.user!.id;
    const { vote_type } = req.body;

    if (!vote_type || !['helpful', 'not_helpful'].includes(vote_type)) {
      throw new AppError('vote_type must be "helpful" or "not_helpful"', 400);
    }

    const result = await reviewService.voteReview(reviewId, userId, vote_type);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * DELETE /api/ai/reviews/:reviewId/vote
 * Remove vote from a review
 */
router.delete('/reviews/:reviewId/vote', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reviewId = toString(req.params.reviewId);
    const userId = req.user!.id;

    const result = await reviewService.removeVote(reviewId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/products/:productId/reviews/settings
 * Get review settings for a product
 */
router.get('/products/:productId/reviews/settings', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);

    const settings = await reviewService.getSettings(productId);

    res.json({
      success: true,
      data: { settings },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/products/:productId/reviews/settings
 * Update review settings for a product
 */
router.put('/products/:productId/reviews/settings', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const { allow_reviews, require_verified_purchase, auto_publish, min_rating, max_rating } = req.body;

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
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/products/:productId/reviews/distribution
 * Get rating distribution for a product
 */
router.get('/products/:productId/reviews/distribution', async (req: Request, res: Response) => {
  try {
    const productId = toString(req.params.productId);

    const distribution = await reviewService.getRatingDistribution(productId);

    res.json({
      success: true,
      data: { distribution },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

// ============================================
// Report Routes (Denunciations)
// ============================================

/**
 * GET /api/ai/reports/reasons?contentType=product
 * Get available report reasons for a content type
 */
router.get('/reports/reasons', async (req: Request, res: Response) => {
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
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/reports
 * Create a new report (authenticated)
 */
router.post('/reports', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reporterId = req.user!.id;
    const { content_type, content_id, reason_code, description } = req.body;

    if (!content_type || !content_id || !reason_code) {
      throw new AppError('content_type, content_id, and reason_code are required', 400);
    }

    const result = await reportService.createReport(reporterId, content_type, content_id, reason_code, description);

    res.status(201).json({
      success: true,
      data: { report: result },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/reports
 * Get reports (admin)
 */
router.get('/reports', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
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
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/reports/:reportId
 * Get a single report by ID (admin)
 */
router.get('/reports/:reportId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportId = toString(req.params.reportId);

    const report = await reportService.getReportById(reportId);
    if (!report) {
      throw new AppError('Report no encontrado', 404);
    }

    const actions = await reportService.getActions(reportId);

    res.json({
      success: true,
      data: { report, actions },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/reports/:reportId/resolve
 * Resolve a report (admin)
 */
router.put('/reports/:reportId/resolve', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportId = toString(req.params.reportId);
    const resolvedBy = req.user!.id;
    const { status, resolution_notes } = req.body;

    if (!status || !['pending', 'investigating', 'resolved', 'rejected'].includes(status)) {
      throw new AppError('status is required and must be valid', 400);
    }

    const result = await reportService.resolveReport(reportId, status, resolvedBy, resolution_notes);

    res.json({
      success: true,
      data: { report: result },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/reports/:reportId/actions
 * Apply action to a report (admin)
 */
router.post('/reports/:reportId/actions', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportId = toString(req.params.reportId);
    const performedBy = req.user!.id;
    const { action_type, notes } = req.body;

    if (!action_type) {
      throw new AppError('action_type is required', 400);
    }

    const validActions = ['warning', 'suspend', 'ban', 'delete_content', 'hide_content', 'no_action'];
    if (!validActions.includes(action_type)) {
      throw new AppError(`action_type must be one of: ${validActions.join(', ')}`, 400);
    }

    const result = await reportService.applyAction(reportId, action_type, performedBy, notes);

    res.json({
      success: true,
      data: { action: result },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/content/policies
 * Get content policies (public)
 */
router.get('/content/policies', async (req: Request, res: Response) => {
  try {
    const contentType = req.query.content_type as string | undefined;

    const policies = await reportService.getPolicies(contentType);

    res.json({
      success: true,
      data: { policies },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

// ============================================
// Phase 5: AI Agents Routes
// ============================================

/**
 * GET /api/ai/products/:productId/qa-agent/config
 * Get QA agent config for a product
 */
router.get('/products/:productId/qa-agent/config', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);

    const config = await qaAgentService.getConfig(productId);

    res.json({
      success: true,
      data: { config },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/products/:productId/qa-agent/config
 * Update QA agent config for a product
 */
router.put('/products/:productId/qa-agent/config', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const { is_enabled, model, system_prompt, temperature, max_tokens, use_memory, use_faqs } = req.body;

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
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/agents/qa/chat
 * Chat with QA agent (uses credits - rate limited)
 */
router.post('/agents/qa/chat', jwtAuthMiddleware, aiChatLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { product_id, message } = req.body;

    if (!product_id || !message) {
      throw new AppError('product_id and message are required', 400);
    }

    const result = await qaAgentService.chat(product_id, userId, message);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/agents/conversations
 * Get user's conversations
 */
router.get('/agents/conversations', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const agentType = req.query.agent_type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;

    const conversations = await qaAgentService.getUserConversations(userId, agentType, limit);

    res.json({
      success: true,
      data: { conversations },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/agents/conversations/:conversationId
 * Get a conversation with messages
 */
router.get('/agents/conversations/:conversationId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const conversationId = toString(req.params.conversationId);

    const result = await qaAgentService.getConversation(conversationId);
    if (!result) {
      throw new AppError('Conversación no encontrada', 404);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

// ============================================
// Phase 6: Analytics Dashboard Routes
// ============================================

/**
 * GET /api/ai/analytics/dashboard
 * Get dashboard metrics for creator (rate limited)
 */
router.get('/analytics/dashboard', jwtAuthMiddleware, aiLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const startDate = req.query.start_date ? new Date(req.query.start_date as string) : undefined;
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : undefined;

    const metrics = await analyticsService.getDashboardMetrics(userId, startDate, endDate);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

// ============================================
// Phase 7: Advanced AI Routes (Tutor + Insights)
// ============================================

/**
 * GET /api/ai/products/:productId/tutor/config
 * Get tutor config for a product
 */
router.get('/products/:productId/tutor/config', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);

    const config = await tutorService.getConfig(productId);

    res.json({
      success: true,
      data: { config },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/products/:productId/tutor/config
 * Update tutor config for a product
 */
router.put('/products/:productId/tutor/config', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const { is_enabled, model, system_prompt, temperature, max_tokens } = req.body;

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
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/products/:productId/tutor/insights
 * Get insights for a user/product
 */
router.get('/products/:productId/tutor/insights', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const userId = req.user!.id;

    const result = await tutorService.getInsights(userId, productId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/products/:productId/tutor/chat
 * Chat with Tutor AI
 */
router.post('/products/:productId/tutor/chat', jwtAuthMiddleware, aiChatLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = toString(req.params.productId);
    const userId = req.user!.id;
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      throw new AppError('El mensaje es requerido', 400);
    }

    if (message.length > 2000) {
      throw new AppError('El mensaje es demasiado largo (máximo 2000 caracteres)', 400);
    }

    const result = await tutorService.chat(productId, userId, message);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * GET /api/ai/insights/dashboards
 * Get user's insight dashboards
 */
router.get('/insights/dashboards', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await insightsService.getDashboards(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/insights/dashboards
 * Create an insight dashboard
 */
router.post('/insights/dashboards', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, description } = req.body;

    if (!name) {
      throw new AppError('name is required', 400);
    }

    const result = await insightsService.createDashboard(userId, name, description);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * PUT /api/ai/insights/dashboards/:dashboardId
 * Update an insight dashboard
 */
router.put('/insights/dashboards/:dashboardId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dashboardId = toString(req.params.dashboardId);
    const { name, description, config } = req.body;

    await insightsService.updateDashboard(dashboardId, { name, description, config });

    res.json({
      success: true,
      data: { message: 'Dashboard updated' },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * DELETE /api/ai/insights/dashboards/:dashboardId
 * Delete an insight dashboard
 */
router.delete('/insights/dashboards/:dashboardId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dashboardId = toString(req.params.dashboardId);

    const deleted = await insightsService.deleteDashboard(dashboardId);

    res.json({
      success: true,
      data: { deleted },
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

/**
 * POST /api/ai/insights/query
 * Query data with AI (rate limited - uses credits)
 */
router.post('/insights/query', jwtAuthMiddleware, aiChatLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { query } = req.body;

    if (!query) {
      throw new AppError('query is required', 400);
    }

    const result = await insightsService.query(userId, query);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    throw new AppError(error.message, 500);
  }
});

export default router;
