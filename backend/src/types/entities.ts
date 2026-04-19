/**
 * Entity types for Crema backend.
 * These interfaces represent the core domain models from the database.
 */

import type { PoolClient } from 'pg';

/**
 * Base user entity with core fields
 */
export interface User {
  id: string;
  username: string;
  email: string;
  fullname: string;
  level: number;
  active: number;
  affiliate_slug: string;
  must_change_password: boolean;
  tax_id?: string;
  tax_condition?: 'ri' | 'monotax' | 'exempt' | 'final_consumer';
  createdate: Date;
}

/**
 * User with password - used for authentication
 */
export interface UserWithPassword extends User {
  password: string;
  two_factor_secret?: string;
  two_factor_enabled: boolean;
  two_factor_backup_codes: string[];
}

/**
 * Product entity from database
 */
export interface Product {
  id: string;
  creator_id: string;
  title: string;
  slug: string;
  type: string;
  description?: string | null;
  content_url?: string | null;
  affiliate_commission_percent: number;
  size_bytes?: number;
  has_structured_content?: boolean;
  prices: { currency: string; amount: number }[];
  status: string;
  guarantee_days?: number | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Order entity from database
 */
export interface Order {
  id: string;
  buyer_id: string;
  product_id: string;
  affiliate_id: string | null;
  amount: number;
  currency: string;
  commission_amount: number;
  original_amount: number | null;
  discount_applied: number;
  coupon_id: string | null;
  status: string;
  payment_method: string;
  external_reference: string;
  gateway_fee: number;
  gateway_tax: number;
  gateway_taxes_detail: Record<string, number>;
  net_platform_profit: number;
  transaction_id?: string;
  commissions_calculated: boolean;
  balance_released: boolean;
  days_of_guarantee_applied: number | null;
  is_guarantee_eligible: boolean;
  gateway_liquidity_days_applied: number;
  release_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  release_date: Date | null;
  creator_id: string | null;
  product_title?: string;
  buyer_username?: string;
  affiliate_username?: string;
}

/**
 * Balance entity from database
 */
export interface Balance {
  id: string;
  user_id: string;
  currency: string;
  pending_balance: number;
  available_balance: number;
  locked_balance: number;
  updated_at: Date;
}

/**
 * Balance transaction record
 */
export interface BalanceTransaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  currency: string;
  reference_type?: string;
  reference_id?: string;
  description?: string;
  created_at: Date;
}

/**
 * Payout/Withdrawal entity
 */
export interface Payout {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  external_reference?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Commission entity for affiliates and creators
 */
export interface Commission {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  fee_applied: number;
  net_amount: number;
  currency: string;
  type: 'creator' | 'affiliate';
  status: 'pending' | 'paid' | 'refunded' | 'cancelled';
  created_at: Date;
  updated_at: Date;
}

/**
 * Coupon entity
 */
export interface Coupon {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_purchase?: number;
  max_uses?: number;
  current_uses: number;
  valid_from?: Date;
  valid_until?: Date;
  status: string;
  created_at: Date;
}

/**
 * Refund entity
 */
export interface Refund {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  currency: string;
  reason?: string;
  status: string;
  created_at: Date;
  processed_at?: Date;
}

/**
 * Platform earnings (aggregated)
 */
export interface PlatformEarnings {
  id: string;
  period_start: Date;
  period_end: Date;
  total_sales: number;
  total_commissions: number;
  net_platform_profit: number;
  currency: string;
  created_at: Date;
}

/**
 * Refresh token storage
 */
export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked: boolean;
  created_at: Date;
  user_agent?: string;
  ip_address?: string;
  device_type?: string;
  last_active?: Date;
}

/**
 * Activity log for audit
 */
export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  ip_address: string;
  user_agent: string;
  created_at: Date;
}

/**
 * Repository method signatures with optional transaction client
 */
export interface RepositoryWithClient {
  client?: PoolClient;
}

/**
 * AppConfig entity for ConfigService
 * Centralized configuration stored in database
 */
export interface AppConfig {
  id: string;
  configKey: string;
  configValue: string;
  configType: 'string' | 'number' | 'boolean' | 'json';
  category: 'ai' | 'retry' | 'admin' | 'commission' | 'cache' | 'providers' | 'features';
  description?: string;
  isPublic: boolean;
  isEncrypted: boolean;
  updatedAt: Date;
}
