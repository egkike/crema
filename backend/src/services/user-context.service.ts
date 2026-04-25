/**
 * UserContextService
 * Part of SDD: docs/project/architecture-improvements/sdd/user-context/
 * 
 * Security: All methods use immutable patterns and validate inputs
 */

import { userContextRepository, type UserContext } from '../repositories/user-context.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

// NOTE: We do NOT sanitize contextData at storage time because:
// 1. contextData is used for AI personalization, not HTML rendering
// 2. Sanitizing at storage time corrupts non-HTML data (e.g., JSON APIs, ML pipelines)
// 3. If contextData is ever rendered in HTML, sanitize at RENDER TIME instead
// 
// If you need XSS protection for HTML contexts, implement sanitizeContextData 
// at the view/API layer, not at storage.

export const userContextService = {
  /**
   * Get context for user + product
   */
  async getContext(userId: string, productId: string): Promise<UserContext | null> {
    try {
      return userContextRepository.findByUserAndProduct(userId, productId);
    } catch (error) {
      logger.error({ error, userId, productId }, 'UserContextService: getContext failed');
      throw error;
    }
  },

  /**
   * Get all contexts for a user
   */
  async getContextsByUser(userId: string): Promise<UserContext[]> {
    try {
      return userContextRepository.findByUser(userId);
    } catch (error) {
      logger.error({ error, userId }, 'UserContextService: getContextsByUser failed');
      throw error;
    }
  },

  /**
   * Update progress for a user + product
   * IMMUTABLE: creates new object instead of mutating existing
   * Uses atomic upsert - no TOCTOU race condition
   */
  async updateProgress(userId: string, productId: string, progress: number): Promise<UserContext> {
    // Validate progress range
    if (typeof progress !== 'number' || isNaN(progress) || !isFinite(progress)) {
      throw new AppError('Invalid progress: must be a valid number', 400);
    }
    if (progress < 0 || progress > 100) {
      throw new AppError('Invalid progress: must be between 0 and 100', 400);
    }
    
    try {
      // IMMUTABLE: create new object directly - no SELECT needed (atomic upsert handles it)
      const newContextData = { progress };
      // Note: we don't sanitize progress (it's a number, not user input string)
      
      return userContextRepository.upsert(userId, productId, newContextData);
    } catch (error) {
      logger.error({ error, userId, productId, progress }, 'UserContextService: updateProgress failed');
      throw error;
    }
  },

  /**
   * Save a question asked by user
   * IMMUTABLE: creates new array instead of mutating
   * Length validation prevents abuse
   * Questions are stored raw (sanitize at render time if needed for HTML)
   */
  async saveQuestion(userId: string, productId: string, question: string): Promise<UserContext> {
    // Validate question length
    if (!question || typeof question !== 'string') {
      throw new AppError('Invalid question: must be a non-empty string', 400);
    }
    if (question.length > 2000) {
      throw new AppError('Invalid question: must be less than 2000 characters', 400);
    }
    
    try {
      // Get current context to preserve existing data
      const existing = await userContextRepository.findByUserAndProduct(userId, productId);
      const existingData = existing?.contextData || {};
      
      // IMMUTABLE: create new array
      const existingQuestions: unknown[] = Array.isArray(existingData.questions) ? existingData.questions : [];
      const updatedQuestions = [...existingQuestions, question].slice(-50);
      
      // IMMUTABLE: create new object - questions stored raw
      const newContextData = { ...existingData, questions: updatedQuestions };
      
      return userContextRepository.upsert(userId, productId, newContextData);
    } catch (error) {
      logger.error({ error, userId, productId, question }, 'UserContextService: saveQuestion failed');
      throw error;
    }
  },

  /**
   * Save question and get AI context for personalization
   */
  async getContextWithHistory(userId: string, productId: string): Promise<{
    context: UserContext | null;
    questions: string[];
    progress: number;
  }> {
    try {
      const context = await userContextRepository.findByUserAndProduct(userId, productId);
      if (!context) {
        return { context: null, questions: [], progress: 0 };
      }
      
      const contextData = context.contextData || {};
      const questions: string[] = Array.isArray(contextData.questions) ? contextData.questions : [];
      const progress: number = typeof contextData.progress === 'number' ? contextData.progress : 0;
      
      return { context, questions, progress };
    } catch (error) {
      logger.error({ error, userId, productId }, 'UserContextService: getContextWithHistory failed');
      throw error;
    }
  },
};