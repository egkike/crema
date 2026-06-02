import { Pool } from 'pg';

import { AppError } from '../errors/AppError';

import { getValidatedSchema } from './validators.util';

/**
 * Verifies that a user owns a product.
 * Throws 403 if ownership check fails.
 * 
 * @param pool - Database pool
 * @param productId - Product UUID to verify
 * @param userId - User UUID to check ownership against
 * @throws AppError with 403 status if user doesn't own the product
 */
export async function verifyProductOwnership(
  pool: Pool,
  productId: string,
  userId: string
): Promise<void> {
  const ownershipCheck = await pool.query(
    `SELECT id FROM "${getValidatedSchema()}"."products" WHERE id = $1 AND creator_id = $2`,
    [productId, userId]
  );
  
  if (ownershipCheck.rows.length === 0) {
    throw new AppError('You do not have permission to access this product', 403);
  }
}

/**
 * Verifies that a user has access to a product (creator, buyer, or affiliate).
 * This is required for AI services to ensure only users with legitimate access can use them.
 * 
 * @param pool - Database pool
 * @param productId - Product UUID to verify
 * @param userId - User UUID to check access against
 * @throws AppError with 403 status if user doesn't have access
 */
export async function verifyProductAccess(
  pool: Pool,
  productId: string,
  userId: string
): Promise<void> {
  const schema = getValidatedSchema();
  
  // 1. Check if user is the creator
  const creatorCheck = await pool.query(
    `SELECT id FROM "${schema}"."products" WHERE id = $1 AND creator_id = $2`,
    [productId, userId]
  );
  if (creatorCheck.rows.length > 0) return;

  // 2. Check if user has purchased the product (confirmed order)
  const purchaseCheck = await pool.query(
    `SELECT id FROM "${schema}"."orders" WHERE product_id = $1 AND buyer_id = $2 AND status = 'confirmed'`,
    [productId, userId]
  );
  if (purchaseCheck.rows.length > 0) return;

  // 3. Check if user is an active affiliate for this product
  const affiliateCheck = await pool.query(
    `SELECT id FROM "${schema}"."affiliate_sales" WHERE product_id = $1 AND affiliate_id = $2`,
    [productId, userId]
  );
  if (affiliateCheck.rows.length > 0) return;

  // No access found
  throw new AppError('You do not have access to this product. Purchase required.', 403);
}

/**
 * Verifies that a user owns or has access to a dashboard.
 * Throws 403 if ownership check fails.
 * 
 * @param pool - Database pool
 * @param dashboardId - Dashboard UUID to verify
 * @param userId - User UUID to check ownership against
 * @throws AppError with 403 status if user doesn't own the dashboard
 */
export async function verifyDashboardOwnership(
  pool: Pool,
  dashboardId: string,
  userId: string
): Promise<void> {
  const ownershipCheck = await pool.query(
    `SELECT id FROM "${getValidatedSchema()}"."insight_dashboards" WHERE id = $1 AND creator_id = $2`,
    [dashboardId, userId]
  );
  
  if (ownershipCheck.rows.length === 0) {
    throw new AppError('You do not have permission to access this dashboard', 403);
  }
}

/**
 * Verifies that a user owns or has access to a conversation.
 * Throws 403 if ownership check fails.
 * 
 * @param pool - Database pool
 * @param conversationId - Conversation UUID to verify
 * @param userId - User UUID to check ownership against
 * @throws AppError with 403 status if user doesn't own the conversation
 */
export async function verifyConversationOwnership(
  pool: Pool,
  conversationId: string,
  userId: string
): Promise<void> {
  const ownershipCheck = await pool.query(
    `SELECT id FROM "${getValidatedSchema()}"."qa_conversations" WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  
  if (ownershipCheck.rows.length === 0) {
    throw new AppError('You do not have permission to access this conversation', 403);
  }
}

/**
 * Verifies that a user is a confirmed buyer of a product.
 * Throws 404 if not a confirmed buyer (404 to avoid leaking user existence).
 *
 * @param pool - Database pool
 * @param productId - Product UUID to verify
 * @param buyerId - User UUID to check buyer status against
 * @throws AppError with 404 status if user is not a confirmed buyer
 */
export async function verifyBuyerOfProduct(
  pool: Pool,
  productId: string,
  buyerId: string
): Promise<void> {
  const schema = getValidatedSchema();
  const buyerCheck = await pool.query(
    `SELECT id FROM "${schema}"."orders" WHERE product_id = $1 AND buyer_id = $2 AND status = 'confirmed'`,
    [productId, buyerId]
  );

  if (buyerCheck.rows.length === 0) {
    throw new AppError('User not found in this product\'s roster', 404);
  }
}

/**
 * Verifies that a creator has orders in a specific period (YYYY-MM format).
 * Throws 403 if zero orders in that period.
 *
 * @param pool - Database pool
 * @param creatorId - Creator UUID
 * @param period - Period string in YYYY-MM format
 * @throws AppError with 403 status if creator has zero orders in the period
 */
export async function verifyCreatorHasDataInPeriod(
  pool: Pool,
  creatorId: string,
  period: string
): Promise<void> {
  const schema = getValidatedSchema();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new AppError('Period must be in YYYY-MM format', 400);
  }

  const [year, month] = period.split('-');
  const startDate = `${year}-${month}-01`;
  // End date is the first day of the NEXT month, so `created_at < endDate` includes all of the current month
  const endDate = new Date(parseInt(year), parseInt(month), 1).toISOString().split('T')[0];

  const periodCheck = await pool.query(
    `SELECT id FROM "${schema}"."orders" o
     JOIN "${schema}"."products" p ON p.id = o.product_id
     WHERE p.creator_id = $1
       AND o.created_at >= $2
       AND o.created_at < $3
     LIMIT 1`,
    [creatorId, startDate, endDate]
  );

  if (periodCheck.rows.length === 0) {
    throw new AppError('No data available for the requested period', 403);
  }
}
