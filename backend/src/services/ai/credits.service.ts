/**
 * AI Credit Service
 * Phase 1: Foundation (Memory + Credits)
 * Manages user credit balance, purchases, and usage
 */

import { creditsRepository } from '../../repositories/ai/credits.repository';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';
import type {
  AICredit,
  AICreditPackage,
  AICreditTransaction,
} from '../../types/ai.types';

export class AICreditService {
  /**
   * Get user's credit balance
   */
  async getBalance(userId: string): Promise<{ balance: number; expiresAt: Date }> {
    const credit = await creditsRepository.getBalance(userId);
    
    if (!credit || credit.balance <= 0) {
      return { balance: 0, expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) };
    }

    return {
      balance: credit.balance,
      expiresAt: credit.expires_at,
    };
  }

  /**
   * Ensure user has a credit record (create if not exists)
   */
  async ensureCreditRecord(userId: string): Promise<AICredit> {
    let credit = await creditsRepository.getBalance(userId);
    
    if (!credit) {
      credit = await creditsRepository.create(userId, 0);
    }

    return credit;
  }

  /**
   * Check if user has sufficient credits
   */
  async hasSufficientCredits(userId: string, amount: number): Promise<boolean> {
    const credit = await creditsRepository.getBalance(userId);
    return credit ? credit.balance >= amount : false;
  }

  /**
   * Use credits (deduct from balance)
   * Idempotent when referenceId is provided — skips if transaction already exists.
   */
  async useCredits(
    userId: string,
    amount: number,
    description: string,
    referenceId?: string
  ): Promise<AICredit> {
    // Idempotency: if referenceId provided, check for existing transaction
    if (referenceId) {
      const { transactions } = await creditsRepository.getTransactions(userId, 100, 0);
      const existingTx = transactions.find(
        (tx) => tx.reference_id === referenceId && tx.type === 'usage'
      );
      if (existingTx) {
        logger.info({ userId, referenceId }, 'Credits already consumed — idempotent skip');
        // Return current balance without charging
        return this.getBalance(userId).then((b) => ({
          balance: b.balance,
          expires_at: b.expiresAt,
          user_id: userId,
          id: '',
          created_at: new Date(),
          updated_at: new Date(),
        }));
      }
    }

    // First check if user has credit record
    await this.ensureCreditRecord(userId);

    // Check balance
    const hasCredits = await this.hasSufficientCredits(userId, amount);
    if (!hasCredits) {
      throw new AppError('Insufficient credits. Please purchase more credits.', 402);
    }

    try {
      const result = await creditsRepository.useCredits(userId, amount, description, referenceId);
      logger.info({ userId, amount, description }, 'Credits used');
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage === 'Insufficient credits') {
        throw new AppError('Insufficient credits. Please purchase more credits.', 402);
      }
      throw error;
    }
  }

  /**
   * Add credits to user balance (purchase or bonus)
   */
  async addCredits(
    userId: string,
    amount: number,
    description: string
  ): Promise<AICredit> {
    try {
      const result = await creditsRepository.addCredits(userId, amount, description);
      logger.info({ userId, amount, description }, 'Credits added');
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ userId, error: errorMessage }, 'Failed to add credits');
      throw new AppError('Failed to add credits', 500);
    }
  }

  /**
   * Purchase a credit package
   */
  async purchasePackage(
    userId: string,
    packageId: string
  ): Promise<{ success: boolean; newBalance: number; transaction: AICreditTransaction }> {
    // Get package details
    const pkg = await creditsRepository.getPackageById(packageId);
    
    if (!pkg) {
      throw new AppError('Credit package not found', 404);
    }

    if (!pkg.is_active) {
      throw new AppError('This credit package is not available', 400);
    }

    // Add credits to user
    const credit = await this.addCredits(
      userId,
      pkg.credits,
      `Purchase: ${pkg.name} (${pkg.credits} credits)`
    );

    // Get the transaction record
    const { transactions } = await creditsRepository.getTransactions(userId, 1, 0);
    const transaction = transactions[0];

    return {
      success: true,
      newBalance: credit.balance,
      transaction,
    };
  }

  /**
   * Get available credit packages
   */
  async getPackages(): Promise<AICreditPackage[]> {
    return creditsRepository.getPackages(false);
  }

  /**
   * Get package by ID
   */
  async getPackageById(packageId: string): Promise<AICreditPackage | null> {
    return creditsRepository.getPackageById(packageId);
  }

  /**
   * Confirm a credit purchase after payment verification
   * Called from webhook handler when payment is approved
   */
  async confirmPurchase(
    userId: string,
    packageId: string,
    transactionId: string
  ): Promise<{ success: boolean; newBalance: number }> {
    // Get package details
    const pkg = await creditsRepository.getPackageById(packageId);
    
    if (!pkg) {
      throw new AppError('Credit package not found', 404);
    }

    if (!pkg.is_active) {
      throw new AppError('This credit package is no longer available', 400);
    }

    // Add credits to user
    const credit = await this.addCredits(
      userId,
      pkg.credits,
      `Purchase: ${pkg.name} (${pkg.credits} credits) - TX: ${transactionId}`
    );

    logger.info({ userId, packageId, credits: pkg.credits, transactionId }, 'Credit purchase confirmed');

    return {
      success: true,
      newBalance: credit.balance,
    };
  }

  /**
   * Get user's credit transactions
   */
  async getTransactions(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ transactions: AICreditTransaction[]; total: number }> {
    return creditsRepository.getTransactions(userId, limit, offset);
  }

  /**
   * Expire old credits (cleanup job)
   */
  async expireOldCredits(): Promise<number> {
    const expiredCredits = await creditsRepository.getExpiredCredits();
    
    let expiredCount = 0;
    for (const credit of expiredCredits) {
      await creditsRepository.expireCredits(credit.user_id);
      expiredCount++;
    }

    if (expiredCount > 0) {
      logger.info({ count: expiredCount }, 'Expired old credits');
    }

    return expiredCount;
  }

  /**
   * Get cost estimate for AI operation
   * This can be expanded based on actual pricing
   */
  getOperationCost(operation: 'search' | 'chat' | 'generate_insight'): number {
    const costs = {
      search: 1,
      chat: 5,
      generate_insight: 10,
    };
    return costs[operation];
  }
}

export const aiCreditService = new AICreditService();
