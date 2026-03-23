/**
 * AI Features Type Definitions
 * Phase 1: Foundation (Memory + Credits)
 */

// ============================================
// AI Credit Types
// ============================================

export interface AICredit {
  id: string;
  user_id: string;
  balance: number;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AICreditPackage {
  id: string;
  name: string;
  credits: number;
  price_usd: number;
  price_ars?: number;
  is_active: boolean;
  created_at: Date;
}

export interface AICreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'purchase' | 'usage' | 'refund' | 'bonus';
  description?: string;
  reference_id?: string;
  created_at: Date;
}

// ============================================
// AI Embedding Types
// ============================================

export type EmbeddingSourceType = 'lesson' | 'faq' | 'policy' | 'qa' | 'review' | 'insight' | 'saved_dashboard';

export interface AIEmbedding {
  id: string;
  user_id: string;
  source_type: EmbeddingSourceType;
  source_id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface EmbeddingSearchResult {
  id: string;
  source_type: EmbeddingSourceType;
  source_id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

// ============================================
// DTOs for API
// ============================================

export interface GetCreditBalanceResponse {
  balance: number;
  expires_at: string;
}

export interface PurchaseCreditPackageRequest {
  packageId: string;
  paymentMethodId?: string;
}

export interface PurchaseCreditPackageResponse {
  success: boolean;
  transaction: AICreditTransaction;
  newBalance: number;
}

export interface CreditTransactionListResponse {
  transactions: AICreditTransaction[];
  total: number;
}

export interface CreditPackageListResponse {
  packages: AICreditPackage[];
}

export interface CreateEmbeddingRequest {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SemanticSearchRequest {
  query: string;
  limit?: number;
  sourceTypes?: EmbeddingSourceType[];
}

export interface SemanticSearchResponse {
  results: EmbeddingSearchResult[];
}
