/**
 * Central type exports for Crema backend.
 * Re-export all type definitions for easy consumption.
 */

// Entity types
export type {
  User,
  UserWithPassword,
  Product,
  Order,
  Balance,
  BalanceTransaction,
  Payout,
  Commission,
  Coupon,
  Refund,
  PlatformEarnings,
  RefreshTokenRow,
  ActivityLog,
  RepositoryWithClient,
} from './entities';

// DTO types
export type {
  CreateOrderDTO,
  UpdateOrderDTO,
  CreateProductDTO,
  UpdateProductDTO,
  CreateCommissionDTO,
  CreatePayoutDTO,
  CreateUserDTO,
  UpdateUserDTO,
  BalanceOperationDTO,
  CreateCouponDTO,
  CreateRefundDTO,
  CreateRefreshTokenDTO,
} from './dto';

// Express types
export type {
  UserPayload,
  AuthenticatedRequest,
} from './express';

// AI types
export type {
  AICredit,
  AICreditPackage,
  AICreditTransaction,
  EmbeddingSourceType,
  AIEmbedding,
  EmbeddingSearchResult,
  GetCreditBalanceResponse,
  PurchaseCreditPackageRequest,
  PurchaseCreditPackageResponse,
  CreditTransactionListResponse,
  CreditPackageListResponse,
  CreateEmbeddingRequest,
  SemanticSearchRequest,
  SemanticSearchResponse,
} from './ai.types';

// Reports Agent types
export type {
  ReportReasonCode,
  TriageSeverity,
  TriageAction,
  TriageResult,
} from './reports.types';
export { REPORT_REASON_LABELS } from './reports.types';

// Interactive Agent types
export type {
  FieldConfig,
  ModuleFieldConfig,
  UserModuleData,
  AnalysisResult,
  AnalyticsResult,
} from './interactive.types';

// Re-export PoolClient type from pg
export type { PoolClient } from 'pg';
