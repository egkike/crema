import { z } from 'zod';

// Credit Packages
export const purchaseCreditsSchema = z.object({
  packageId: z.string().uuid({ message: 'Invalid package ID' }),
  currency: z.enum(['ARS', 'USD', 'USDT']).default('ARS'),
  gatewayId: z.string().uuid().optional(),
});

// Questions
export const createQuestionSchema = z.object({
  question: z
    .string()
    .min(1, 'Question is required')
    .max(2000, 'Question too long (max 2000 characters)'),
});

export const answerQuestionSchema = z.object({
  answer: z
    .string()
    .min(1, 'Answer is required')
    .max(5000, 'Answer too long (max 5000 characters)'),
});

export const voteQuestionSchema = z.object({
  vote_type: z.enum(['helpful', 'not_helpful']),
});

// FAQs
export const createFAQSchema = z.object({
  question: z.string().min(1, 'Question is required').max(500, 'Question too long'),
  answer: z.string().min(1, 'Answer is required').max(5000, 'Answer too long'),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const updateFAQSchema = z.object({
  question: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).max(5000).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const reorderFAQsSchema = z.object({
  faq_ids: z.array(z.string().uuid()),
});

// Reviews
export const createReviewSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating must be at most 5'),
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  content: z.string().min(1, 'Content is required').max(5000, 'Content too long'),
});

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(5000).optional(),
  is_published: z.boolean().optional(),
});

export const voteReviewSchema = z.object({
  vote_type: z.enum(['helpful', 'not_helpful']),
});

// Reviews Settings
export const updateReviewSettingsSchema = z.object({
  allow_reviews: z.boolean().optional(),
  require_verified_purchase: z.boolean().optional(),
  auto_publish: z.boolean().optional(),
  min_rating: z.number().int().min(1).max(5).optional(),
  max_rating: z.number().int().min(1).max(5).optional(),
});

// Reports/Denunciations
export const createReportSchema = z.object({
  content_type: z.enum(['product', 'review', 'question', 'answer', 'user']),
  content_id: z.string().uuid(),
  reason_code: z.string().min(1, 'Reason code is required'),
  description: z.string().max(2000, 'Description too long').optional(),
});

export const resolveReportSchema = z.object({
  status: z.enum(['resolved', 'dismissed', 'pending']),
  resolution_notes: z.string().max(1000).optional(),
});

export const reportActionSchema = z.object({
  action_type: z.enum(['warning', 'suspend', 'ban', 'delete_content', 'hide_content', 'no_action']),
  notes: z.string().max(1000).optional(),
});

// QA Agent Config
export const updateQAConfigSchema = z.object({
  is_enabled: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(100).max(4000).optional(),
  system_prompt: z.string().max(10000).optional(),
  use_memory: z.boolean().optional(),
  use_faqs: z.boolean().optional(),
});

// Embeddings
export const createEmbeddingSchema = z.object({
  sourceType: z.enum(['lesson', 'faq', 'policy', 'qa', 'review', 'insight', 'saved_dashboard']),
  sourceId: z.string().uuid(),
  content: z.string().min(1, 'Content is required').max(10000),
});

// Tutor Config
export const updateTutorConfigSchema = z.object({
  is_enabled: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(100).max(4000).optional(),
  system_prompt: z.string().max(10000).optional(),
});

// Insights
export const createDashboardSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  description: z.string().max(500).optional(),
});

export const updateDashboardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  is_default: z.boolean().optional(),
});

export const insightsQuerySchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
});

// Chat Messages
export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
});

export const streamChatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
});

// Question Publish
export const publishQuestionSchema = z.object({
  is_published: z.boolean(),
});

// QA Chat with product_id
export const qaChatSchema = z.object({
  product_id: z.string().uuid({ message: 'Invalid product ID' }),
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
});

// Affiliate Chat
export const affiliateChatSchema = z.object({
  productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
  message: z
    .string()
    .min(1, { message: 'message is required' })
    .max(2000, { message: 'message must be less than 2000 characters' }),
  userId: z.string().uuid({ message: 'userId must be a valid UUID' }),
});

export type AffiliateChatRequest = z.infer<typeof affiliateChatSchema>;

// SEO Optimizer
export const seoOptimizerSchema = z.object({
  productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
  productName: z
    .string()
    .min(1, { message: 'productName is required' })
    .max(200, { message: 'productName must be less than 200 characters' }),
  productDescription: z
    .string()
    .min(10, { message: 'productDescription must be at least 10 characters' })
    .max(5000, { message: 'productDescription must be less than 5000 characters' }),
  productType: z.enum(['course', 'ebook', 'podcast', 'membership', 'software', 'audiobook'], {
    message: 'productType must be one of: course, ebook, podcast, membership, software, audiobook',
  }),
  creatorName: z.string().max(100).optional(),
  userId: z.string().uuid({ message: 'userId must be a valid UUID' }),
});

export type SEOOptimizerRequest = z.infer<typeof seoOptimizerSchema>;

// =============================================================================
// Query Parameter Validation Schemas
// =============================================================================

// Pagination
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// Date Range
export const dateRangeSchema = z.object({
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});

// Questions Query
export const questionsQuerySchema = paginationSchema.extend({
  include_unpublished: z.coerce.boolean().default(false),
});

// Reviews Query
export const reviewsQuerySchema = paginationSchema.extend({
  include_unpublished: z.coerce.boolean().default(false),
});

// Transactions Query
export const transactionsQuerySchema = paginationSchema;

// Reports Query
export const reportsQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'investigating', 'resolved', 'rejected']).optional(),
  content_type: z.enum(['product', 'review', 'question', 'answer', 'user']).optional(),
});

// Conversations Query
export const conversationsQuerySchema = paginationSchema.extend({
  agent_type: z.enum(['qa', 'tutor', 'insights']).optional(),
});

// Analytics Query
export const analyticsQuerySchema = dateRangeSchema;
