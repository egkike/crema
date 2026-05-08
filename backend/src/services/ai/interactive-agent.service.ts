/**
 * Interactive Agent Service
 * SDD: docs/project/ai-features/sdd/interactive-agent/
 * Business logic layer for interactive module field configuration,
 * user data management, AI analysis, and aggregated analytics.
 */

import { z } from 'zod';

import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';
import {
  interactiveAgentRepository,
  type FieldConfigReturn,
  type UserDataRowReturn,
} from '../../repositories/ai/interactive-agent.repository';
import { productRepository } from '../../repositories/product.repository';
import type {
  FieldConfig,
  ModuleFieldConfig,
  UserModuleData,
  AnalysisResult,
  AnalyticsResult,
} from '../../types/interactive.types';
import { outputAnalysisSchema } from '../../schemas/interactive.schema';

import { aiCreditService } from './credits.service';
import { llmService } from './llm.service';

// =========================================================================
// Constants
// =========================================================================

const CREDIT_COST_SAVE = 1;
const CREDIT_COST_ANALYSIS = 3;
const MAX_INPUT_DATA_SIZE = 50 * 1024; // 50KB
const MAX_FIELDS_PER_MODULE = 50;

// =========================================================================
// Helper functions
// =========================================================================

/**
 * Build the system prompt for the AI analyst.
 */
function buildAnalysisSystemPrompt(productName: string, moduleKey: string): string {
  return `Eres un analista de negocios para el producto "${productName}".
El usuario ha completado el módulo "${moduleKey}" con los siguientes datos que ingresó:

Genera un análisis personalizado que incluya:
1. Análisis basado en estos datos específicos
2. Recomendaciones actionables (máx 5)
3. Próximos pasos concretos (máx 3)
4. Métricas calculadas si aplica

Responde en JSON con este formato:
{
  "analysis": "string",
  "recommendations": ["string"],
  "nextSteps": ["string"],
  "metrics": {}
}`;
}

/**
 * Format user input data as a readable prompt string.
 */
function formatUserDataForPrompt(inputData: Record<string, unknown>, fields: FieldConfig[]): string {
  return Object.entries(inputData)
    .map(([key, value]) => {
      const field = fields.find(f => f.fieldName === key);
      const label = field?.fieldLabel || key;
      return `- ${label}: ${value}`;
    })
    .join('\n');
}

/**
 * Parse raw LLM response into structured analysis result.
 * Graceful fallback on invalid JSON or missing fields.
 */
function parseAnalysisResponse(raw: string): Omit<AnalysisResult, 'creditsUsed'> {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.analysis || !parsed.recommendations) throw new Error('Invalid response structure');
    return {
      analysis: String(parsed.analysis),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.map(String) : [],
      metrics: parsed.metrics && typeof parsed.metrics === 'object' ? parsed.metrics : {},
    };
  } catch {
    return {
      analysis: 'Análisis no disponible por el momento.',
      recommendations: ['Intenta nuevamente más tarde'],
      nextSteps: [],
      metrics: {},
    };
  }
}

/**
 * Check serialized size of input data.
 */
function checkInputDataSize(inputData: Record<string, unknown>): void {
  const size = Buffer.byteLength(JSON.stringify(inputData), 'utf8');
  if (size > MAX_INPUT_DATA_SIZE) {
    throw new AppError('Input data exceeds 50KB limit', 413);
  }
}

/**
 * Group field configs by module key.
 */
function groupFieldsByModule(fields: FieldConfigReturn[]): ModuleFieldConfig[] {
  const map = new Map<string, FieldConfig[]>();
  for (const field of fields) {
    const existing = map.get(field.moduleKey) || [];
    existing.push({
      moduleKey: field.moduleKey,
      fieldName: field.fieldName,
      fieldType: field.fieldType,
      fieldLabel: field.fieldLabel,
      fieldPlaceholder: field.fieldPlaceholder,
      fieldOptions: field.fieldOptions,
      fieldRequired: field.fieldRequired,
      fieldValidation: field.fieldValidation,
      orderIndex: field.orderIndex,
    });
    map.set(field.moduleKey, existing);
  }
  return Array.from(map.entries()).map(([moduleKey, fields]) => ({ moduleKey, fields }));
}

/**
 * Map UserDataRowReturn to UserModuleData (strips internal fields).
 */
function mapToUserModuleData(rows: UserDataRowReturn[]): UserModuleData[] {
  return rows.map(row => ({
    moduleKey: row.moduleKey,
    inputData: row.inputData,
    outputAnalysis: row.outputAnalysis,
    completedAt: row.completedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Check that all required fields are present in input data.
 */
function validateRequiredFields(
  inputData: Record<string, unknown>,
  fields: FieldConfigReturn[]
): void {
  const requiredFields = fields.filter(f => f.fieldRequired);
  const missing = requiredFields.filter(f => !(f.fieldName in inputData));
  if (missing.length > 0) {
    throw new AppError(
      `Missing required fields: ${missing.map(f => f.fieldName).join(', ')}`,
      400
    );
  }
}

// =========================================================================
// Service
// =========================================================================

export const interactiveAgentService = {
  // =========================================================================
  // Field config
  // =========================================================================

  /**
   * Get field configurations for a product.
   * Access: product owner OR buyer with active order.
   */
  async getFields(productId: string, userId: string): Promise<ModuleFieldConfig[]> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Check access (owner or buyer)
    const hasAccess = await interactiveAgentRepository.hasProductAccess(userId, productId);
    if (!hasAccess) {
      throw new AppError('No tienes acceso a este producto', 403);
    }

    const fields = await interactiveAgentRepository.findFieldsByProduct(productId);
    return groupFieldsByModule(fields);
  },

  /**
   * Create/update field configurations for a module.
   * Access: product owner only.
   */
  async createFields(
    productId: string,
    userId: string,
    moduleKey: string,
    fields: FieldConfig[]
  ): Promise<void> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Check ownership
    const isOwner = await interactiveAgentRepository.isProductOwner(userId, productId);
    if (!isOwner) {
      throw new AppError('Solo el creador del producto puede configurar campos', 403);
    }

    // Validate field count
    if (fields.length > MAX_FIELDS_PER_MODULE) {
      throw new AppError(`Maximum ${MAX_FIELDS_PER_MODULE} fields per module`, 400);
    }
    if (fields.length === 0) {
      throw new AppError('At least one field is required', 400);
    }

    // Map FieldConfig to repository format
    const repoFields = fields.map((f, i) => ({
      fieldName: f.fieldName,
      fieldType: f.fieldType,
      fieldLabel: f.fieldLabel,
      fieldPlaceholder: f.fieldPlaceholder ?? null,
      fieldOptions: f.fieldOptions ?? null,
      fieldRequired: f.fieldRequired ?? false,
      fieldValidation: f.fieldValidation ?? null,
      orderIndex: f.orderIndex ?? i,
    }));

    await interactiveAgentRepository.upsertFields(productId, moduleKey, repoFields);
    logger.info({ productId, moduleKey, fieldCount: fields.length }, 'Interactive fields created');
  },

  // =========================================================================
  // User data
  // =========================================================================

  /**
   * Get user's saved data for a product.
   * Access: product owner OR buyer with active order.
   */
  async getUserData(
    productId: string,
    userId: string,
    moduleKey?: string
  ): Promise<UserModuleData[]> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Check access (owner or buyer) — S6: use hasProductAccess so owner can also see data
    const hasAccess = await interactiveAgentRepository.hasProductAccess(userId, productId);
    if (!hasAccess) {
      throw new AppError('No tienes acceso a este producto', 403);
    }

    const rows = await interactiveAgentRepository.findUserData(userId, productId, moduleKey);
    return mapToUserModuleData(rows);
  },

  /**
   * Save user data for a module (first save — consumes 1 credit).
   * Access: buyer with active order.
   * Returns: savedAt timestamp.
   */
  async saveUserData(
    productId: string,
    userId: string,
    moduleKey: string,
    inputData: Record<string, unknown>
  ): Promise<string> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Check active order
    const hasOrder = await interactiveAgentRepository.hasActiveOrder(userId, productId);
    if (!hasOrder) {
      throw new AppError('No tienes acceso a este producto', 403);
    }

    // Check data size
    checkInputDataSize(inputData);

    // CR3: Upsert first, then charge credit based on actual insert outcome (wasInsert)
    // The advisory lock in upsertUserData serializes concurrent calls.
    const { wasInsert } = await interactiveAgentRepository.upsertUserData(
      userId, productId, moduleKey, inputData
    );

    // Consume credit only on actual insert (first save)
    if (wasInsert) {
      await aiCreditService.useCredits(
        userId,
        CREDIT_COST_SAVE,
        `Interactive save: ${productId}/${moduleKey}`
      );
    }

    const savedAt = new Date().toISOString();
    logger.info({ productId, moduleKey, userId, wasInsert }, 'Interactive user data saved');
    return savedAt;
  },

  /**
   * Update existing user data (no credit charge).
   * Access: buyer with active order.
   * Requires: data must already exist (404 if not).
   * Returns: savedAt timestamp.
   */
  async updateUserData(
    productId: string,
    userId: string,
    moduleKey: string,
    inputData: Record<string, unknown>
  ): Promise<string> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Check active order
    const hasOrder = await interactiveAgentRepository.hasActiveOrder(userId, productId);
    if (!hasOrder) {
      throw new AppError('No tienes acceso a este producto', 403);
    }

    // Check data size
    checkInputDataSize(inputData);

    // Verify data exists
    const exists = await interactiveAgentRepository.userDataExists(userId, productId, moduleKey);
    if (!exists) {
      throw new AppError('No data found for this module — use saveUserData first', 404);
    }

    // No credit charge for updates
    await interactiveAgentRepository.upsertUserData(userId, productId, moduleKey, inputData);

    const savedAt = new Date().toISOString();
    logger.info({ productId, moduleKey, userId }, 'Interactive user data updated');
    return savedAt;
  },

  // =========================================================================
  // Analysis
  // =========================================================================

  /**
   * Request AI analysis for a completed module.
   * Access: buyer with active order.
   * Cost: 3 credits.
   */
  async analyzeData(
    productId: string,
    userId: string,
    moduleKey: string
  ): Promise<AnalysisResult> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Check active order
    const hasOrder = await interactiveAgentRepository.hasActiveOrder(userId, productId);
    if (!hasOrder) {
      throw new AppError('No tienes acceso a este producto', 403);
    }

    // CR1: Check credit balance FIRST (before any work)
    const creditBalance = await aiCreditService.getBalance(userId);
    if (creditBalance.balance < CREDIT_COST_ANALYSIS) {
      throw new AppError('INTERACTIVE_INSUFFICIENT_CREDITS', 402);
    }

    // SUGGESTION-2 (Judge 2): Parallelize independent DB reads
    const [userData, moduleFields] = await Promise.all([
      interactiveAgentRepository.findUserData(userId, productId, moduleKey),
      interactiveAgentRepository.findFieldsByModule(productId, moduleKey),
    ]);
    if (userData.length === 0) {
      throw new AppError('No data found for this module — save data first', 404);
    }

    // WARNING-2: Compensating pattern — detect retry of incomplete analysis.
    // If the first upsert (completed=false) succeeded but the second upsert (completed=true)
    // or the credit charge failed, the user was already charged 3 credits but the module
    // remains completed=false. On retry, outputAnalysis exists AND completed=false means we
    // should skip the LLM call and just retry the completion flow to avoid double-charging.
    const latestData = userData[0]; // Most recent (ordered by created_at DESC)
    const isRetryOfIncomplete =
      latestData.outputAnalysis !== null &&
      latestData.completed === false;

    if (isRetryOfIncomplete) {
      // Retry path: skip LLM, re-use existing analysis, complete the flow
      logger.info({ userId, productId, moduleKey }, 'Retrying incomplete analysis — skipping LLM call');

      // WARNING-1: Check if credits were already consumed before the original failure.
      // existingBalance was captured at the start of analyzeData (line 385).
      // If currentBalance === existingBalance, credits were NOT consumed → charge now.
      // If currentBalance === existingBalance - 3, credits WERE consumed → skip charge.
      const existingBalance = creditBalance.balance;
      const currentBalance = await aiCreditService.getBalance(userId);
      const expectedBalanceAfterCharge = existingBalance - CREDIT_COST_ANALYSIS;

      if (currentBalance.balance >= expectedBalanceAfterCharge) {
        // Credits NOT yet consumed (useCredits failed in original attempt), charge now
        await aiCreditService.useCredits(
          userId,
          CREDIT_COST_ANALYSIS,
          `Interactive analysis (retry): ${productId}/${moduleKey}`,
          `analysis-${latestData.id}`
        );
      }
      // else: credits were already consumed — skip charge to avoid double-charging

      // Mark as completed
      await interactiveAgentRepository.upsertUserData(
        userId,
        productId,
        moduleKey,
        latestData.inputData,
        latestData.outputAnalysis as Record<string, unknown>,
        true // completed = true
      );

      const parsed = parseAnalysisResponse(JSON.stringify(latestData.outputAnalysis));
      const result: AnalysisResult = {
        ...parsed,
        creditsUsed: CREDIT_COST_ANALYSIS,
      };

      logger.info({ productId, moduleKey, userId, creditsUsed: CREDIT_COST_ANALYSIS, retry: true }, 'Interactive analysis retry completed');
      return result;
    }

    // Check required fields are complete
    validateRequiredFields(latestData.inputData, moduleFields);

    // Build prompt
    const productName = product.title || 'Producto';
    const systemPrompt = buildAnalysisSystemPrompt(productName, moduleKey);
    const userPrompt = formatUserDataForPrompt(latestData.inputData, moduleFields);

    // Call LLM
    const llmResponse = await llmService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 1000,
    });

    // Parse response
    const parsed = parseAnalysisResponse(llmResponse.content);

    // W1: Validate LLM output with Zod schema before saving
    let validatedOutput: z.infer<typeof outputAnalysisSchema>;
    try {
      validatedOutput = outputAnalysisSchema.parse(parsed);
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new AppError('Invalid analysis output format', 400);
      }
      throw err;
    }

    // W2: Save WITHOUT completed flag first (compensating pattern for race condition)
    // If credit charge fails, the analysis is saved but not marked completed,
    // so it can be retried on the next analyze call without double-charging.
    await interactiveAgentRepository.upsertUserData(
      userId,
      productId,
      moduleKey,
      latestData.inputData,
      validatedOutput as Record<string, unknown>,
      false // completed = false initially
    );

    // CR1: Consume credits AFTER successful save
    await aiCreditService.useCredits(
      userId,
      CREDIT_COST_ANALYSIS,
      `Interactive analysis: ${productId}/${moduleKey}`
    );

    // W2: Only mark as completed AFTER credits are successfully consumed
    await interactiveAgentRepository.upsertUserData(
      userId,
      productId,
      moduleKey,
      latestData.inputData,
      validatedOutput as Record<string, unknown>,
      true // completed = true only after credits consumed
    );

    const result: AnalysisResult = {
      ...parsed,
      creditsUsed: CREDIT_COST_ANALYSIS,
    };

    logger.info({ productId, moduleKey, userId, creditsUsed: CREDIT_COST_ANALYSIS }, 'Interactive analysis completed');
    return result;
  },

  // =========================================================================
  // Analytics
  // =========================================================================

  /**
   * Get aggregated analytics for a product.
   * Access: product owner only.
   * Returns anonymized data — no personal information.
   */
  async getAnalytics(productId: string, creatorId: string): Promise<AnalyticsResult> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Check ownership
    const isOwner = await interactiveAgentRepository.isProductOwner(creatorId, productId);
    if (!isOwner) {
      throw new AppError('Solo el creador del producto puede ver analytics', 403);
    }

    // Get aggregated stats and user counts in parallel
    const [stats, counts] = await Promise.all([
      interactiveAgentRepository.getAggregatedStats(productId),
      interactiveAgentRepository.countUserStats(productId),
    ]);

    const result: AnalyticsResult = {
      totalUsers: counts.distinctUsers,
      completedModules: counts.completedModules,
      averageCompletion: stats.averageCompletion,
      fieldStats: stats.fieldStats,
    };

    logger.info({ productId, creatorId, totalUsers: result.totalUsers }, 'Interactive analytics retrieved');
    return result;
  },
};
