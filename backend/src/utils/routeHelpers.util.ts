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
