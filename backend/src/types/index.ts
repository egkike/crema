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

// Re-export PoolClient type from pg
export type { PoolClient } from 'pg';
