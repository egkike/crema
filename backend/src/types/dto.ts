/**
 * Data Transfer Objects (DTOs) for Crema backend.
 * These interfaces represent input/output structures for API operations.
 */

/**
 * DTO for creating a new order
 */
export interface CreateOrderDTO {
  buyerId: string;
  productId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  externalReference: string;
  status?: string;
  affiliateId?: string | null;
  commissionAmount?: number;
  originalAmount?: number;
  discountApplied?: number;
  couponId?: string | null;
}

/**
 * DTO for updating an existing order
 */
export interface UpdateOrderDTO {
  status?: string;
  transactionId?: string;
  commissionAmount?: number;
  commissionsCalculated?: boolean;
  balanceReleased?: boolean;
  releaseAt?: Date;
}

/**
 * DTO for creating a new product
 */
export interface CreateProductDTO {
  creatorId: string;
  title: string;
  slug: string;
  type: string;
  prices: { currency: string; amount: number }[];
  description?: string;
  contentUrl?: string;
  affiliate_commission_percent?: number;
  status?: string;
}

/**
 * DTO for updating a product
 */
export interface UpdateProductDTO {
  title?: string;
  description?: string;
  contentUrl?: string;
  prices?: { currency: string; amount: number }[];
  affiliate_commission_percent?: number;
  status?: string;
}

/**
 * DTO for creating a commission
 */
export interface CreateCommissionDTO {
  userId: string;
  orderId: string;
  amount: number;
  feeApplied: number;
  netAmount: number;
  currency: string;
  type: 'creator' | 'affiliate';
  status?: 'pending' | 'paid' | 'refunded' | 'cancelled';
}

/**
 * DTO for creating a payout/withdrawal request
 */
export interface CreatePayoutDTO {
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  externalReference?: string;
}

/**
 * DTO for creating a user
 */
export interface CreateUserDTO {
  email: string;
  fullname: string;
  username?: string;
  password?: string;
  level?: number;
  active?: number;
  tax_id?: string;
  tax_condition?: string;
}

/**
 * DTO for updating a user
 */
export interface UpdateUserDTO {
  fullname?: string;
  level?: number;
  active?: number;
  tax_id?: string;
  tax_condition?: string;
}

/**
 * DTO for balance operations
 */
export interface BalanceOperationDTO {
  userId: string;
  amount: number;
  currency: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

/**
 * DTO for creating a coupon
 */
export interface CreateCouponDTO {
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minPurchase?: number;
  maxUses?: number;
  validFrom?: Date;
  validUntil?: Date;
  status?: string;
}

/**
 * DTO for creating a refund
 */
export interface CreateRefundDTO {
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  reason?: string;
}

/**
 * Input for refresh token storage
 */
export interface CreateRefreshTokenDTO {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
  deviceType?: string;
}
