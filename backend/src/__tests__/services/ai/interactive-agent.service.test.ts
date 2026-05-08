import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { interactiveAgentService } from '../../../services/ai/interactive-agent.service';
import { interactiveAgentRepository, type FieldConfigReturn } from '../../../repositories/ai/interactive-agent.repository';
import { productRepository } from '../../../repositories/product.repository';
import { aiCreditService } from '../../../services/ai/credits.service';
import { llmService } from '../../../services/ai/llm.service';
import { AppError } from '../../../errors/AppError';

// Mocks for external dependencies
vi.mock('../../../repositories/ai/interactive-agent.repository', () => ({
  interactiveAgentRepository: {
    findFieldsByProduct: vi.fn(),
    findFieldsByModule: vi.fn(),
    upsertFields: vi.fn(),
    deleteFieldsByModule: vi.fn(),
    findUserData: vi.fn(),
    upsertUserData: vi.fn(),
    userDataExists: vi.fn(),
    getAggregatedStats: vi.fn(),
    countUserStats: vi.fn(),
    hasProductAccess: vi.fn(),
    isProductOwner: vi.fn(),
    hasActiveOrder: vi.fn(),
  },
}));

vi.mock('../../../services/ai/credits.service', () => ({
  aiCreditService: {
    getBalance: vi.fn(),
    useCredits: vi.fn(),
  },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn(),
  },
}));

// Test constants
const USER_ID = '00000000-0000-0000-0000-000000000001';
const CREATOR_ID = '00000000-0000-0000-0000-000000000003';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';
const MODULE_KEY = 'test_module';

const mockProduct = {
  id: PRODUCT_ID,
  creator_id: CREATOR_ID,
  title: 'Test Product',
  type: 'course' as const,
  status: 'published' as const,
  prices: [{ amount: 5000, currency: 'ARS' }],
};

describe('interactiveAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // getFields
  // =========================================================================

  describe('getFields', () => {
    it('should return empty array when no fields configured', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasProductAccess).mockResolvedValue(true);
      vi.mocked(interactiveAgentRepository.findFieldsByProduct).mockResolvedValue([]);

      const result = await interactiveAgentService.getFields(PRODUCT_ID, USER_ID);

      expect(result).toEqual([]);
    });

    it('should group fields by module_key', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasProductAccess).mockResolvedValue(true);
      vi.mocked(interactiveAgentRepository.findFieldsByProduct).mockResolvedValue([
        {
          moduleKey: 'module_a',
          fieldName: 'field1',
          fieldType: 'string',
          fieldLabel: 'Field 1',
          fieldRequired: true,
          orderIndex: 0,
        },
        {
          moduleKey: 'module_a',
          fieldName: 'field2',
          fieldType: 'number',
          fieldLabel: 'Field 2',
          fieldRequired: false,
          orderIndex: 1,
        },
        {
          moduleKey: 'module_b',
          fieldName: 'field3',
          fieldType: 'boolean',
          fieldLabel: 'Field 3',
          fieldRequired: false,
          orderIndex: 0,
        },
      ]);

      const result = await interactiveAgentService.getFields(PRODUCT_ID, USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].moduleKey).toBe('module_a');
      expect(result[0].fields).toHaveLength(2);
      expect(result[1].moduleKey).toBe('module_b');
      expect(result[1].fields).toHaveLength(1);
    });

    it('should throw 404 if product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(interactiveAgentService.getFields(PRODUCT_ID, USER_ID)).rejects.toThrow(
        new AppError('Producto no encontrado', 404)
      );
    });

    it('should throw 403 if user has no access', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasProductAccess).mockResolvedValue(false);

      await expect(interactiveAgentService.getFields(PRODUCT_ID, USER_ID)).rejects.toThrow(
        new AppError('No tienes acceso a este producto', 403)
      );
    });
  });

  // =========================================================================
  // createFields
  // =========================================================================

  describe('createFields', () => {
    const validFields = [
      {
        moduleKey: MODULE_KEY,
        fieldName: 'test_field',
        fieldType: 'string' as const,
        fieldLabel: 'Test Field',
        fieldRequired: true,
      },
    ];

    it('should throw 404 if product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(
        interactiveAgentService.createFields(PRODUCT_ID, CREATOR_ID, MODULE_KEY, validFields)
      ).rejects.toThrow(new AppError('Producto no encontrado', 404));
    });

    it('should throw 403 if user is not product owner', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.isProductOwner).mockResolvedValue(false);

      await expect(
        interactiveAgentService.createFields(PRODUCT_ID, USER_ID, MODULE_KEY, validFields)
      ).rejects.toThrow(
        new AppError('Solo el creador del producto puede configurar campos', 403)
      );
    });

    it('should throw 400 if field count exceeds 50', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.isProductOwner).mockResolvedValue(true);

      const tooManyFields = Array.from({ length: 51 }, (_, i) => ({
        moduleKey: MODULE_KEY,
        fieldName: `field_${i}`,
        fieldType: 'string' as const,
        fieldLabel: `Field ${i}`,
      }));

      await expect(
        interactiveAgentService.createFields(PRODUCT_ID, CREATOR_ID, MODULE_KEY, tooManyFields)
      ).rejects.toThrow(new AppError('Maximum 50 fields per module', 400));
    });

    it('should throw 400 if no fields provided', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.isProductOwner).mockResolvedValue(true);

      await expect(
        interactiveAgentService.createFields(PRODUCT_ID, CREATOR_ID, MODULE_KEY, [])
      ).rejects.toThrow(new AppError('At least one field is required', 400));
    });

    it('should call upsertFields with correct params', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.isProductOwner).mockResolvedValue(true);
      vi.mocked(interactiveAgentRepository.upsertFields).mockResolvedValue(undefined);

      await interactiveAgentService.createFields(PRODUCT_ID, CREATOR_ID, MODULE_KEY, validFields);

      expect(interactiveAgentRepository.upsertFields).toHaveBeenCalledWith(
        PRODUCT_ID,
        MODULE_KEY,
        expect.arrayContaining([
          expect.objectContaining({
            fieldName: 'test_field',
            fieldType: 'string',
            fieldLabel: 'Test Field',
            fieldRequired: true,
          }),
        ])
      );
    });
  });

  // =========================================================================
  // saveUserData
  // =========================================================================

  describe('saveUserData', () => {
    const validInputData = { field1: 'value1', field2: 42 };

    it('should throw 404 if product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(
        interactiveAgentService.saveUserData(PRODUCT_ID, USER_ID, MODULE_KEY, validInputData)
      ).rejects.toThrow(new AppError('Producto no encontrado', 404));
    });

    it('should throw 403 if user has no active order', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(false);

      await expect(
        interactiveAgentService.saveUserData(PRODUCT_ID, USER_ID, MODULE_KEY, validInputData)
      ).rejects.toThrow(new AppError('No tienes acceso a este producto', 403));
    });

    it('should throw 413 if data exceeds 50KB', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);

      const largeData: Record<string, unknown> = {};
      for (let i = 0; i < 6000; i++) {
        largeData[`key_${i}`] = 'x'.repeat(10);
      }

      await expect(
        interactiveAgentService.saveUserData(PRODUCT_ID, USER_ID, MODULE_KEY, largeData)
      ).rejects.toThrow(new AppError('Input data exceeds 50KB limit', 413));
    });

    it('should consume 1 credit on first save', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(interactiveAgentRepository.upsertUserData).mockResolvedValue({ wasInsert: true });
      vi.mocked(aiCreditService.useCredits).mockResolvedValue({ balance: 9 } as any);

      const result = await interactiveAgentService.saveUserData(
        PRODUCT_ID,
        USER_ID,
        MODULE_KEY,
        validInputData
      );

      expect(result).toBeDefined();
      expect(aiCreditService.useCredits).toHaveBeenCalledWith(
        USER_ID,
        1,
        `Interactive save: ${PRODUCT_ID}/${MODULE_KEY}`
      );
    });

    it('should NOT consume credit on update', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(interactiveAgentRepository.upsertUserData).mockResolvedValue({ wasInsert: false });

      await interactiveAgentService.saveUserData(PRODUCT_ID, USER_ID, MODULE_KEY, validInputData);

      expect(aiCreditService.useCredits).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateUserData
  // =========================================================================

  describe('updateUserData', () => {
    const validInputData = { field1: 'updated_value' };

    it('should throw 404 if product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(
        interactiveAgentService.updateUserData(PRODUCT_ID, USER_ID, MODULE_KEY, validInputData)
      ).rejects.toThrow(new AppError('Producto no encontrado', 404));
    });

    it('should throw 403 if user has no active order', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(false);

      await expect(
        interactiveAgentService.updateUserData(PRODUCT_ID, USER_ID, MODULE_KEY, validInputData)
      ).rejects.toThrow(new AppError('No tienes acceso a este producto', 403));
    });

    it('should throw 404 if data does not exist', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(interactiveAgentRepository.userDataExists).mockResolvedValue(false);

      await expect(
        interactiveAgentService.updateUserData(PRODUCT_ID, USER_ID, MODULE_KEY, validInputData)
      ).rejects.toThrow(
        new AppError('No data found for this module — use saveUserData first', 404)
      );
    });

    it('should NOT consume credits on update', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(interactiveAgentRepository.userDataExists).mockResolvedValue(true);
      vi.mocked(interactiveAgentRepository.upsertUserData).mockResolvedValue({ wasInsert: false });

      await interactiveAgentService.updateUserData(PRODUCT_ID, USER_ID, MODULE_KEY, validInputData);

      expect(aiCreditService.useCredits).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // analyzeData
  // =========================================================================

  describe('analyzeData', () => {
    const mockUserData = [
      {
        id: 'data-1',
        userId: USER_ID,
        productId: PRODUCT_ID,
        moduleKey: MODULE_KEY,
        inputData: { field1: 'value1', field2: 42 },
        outputAnalysis: null,
        completed: false,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const mockModuleFields: FieldConfigReturn[] = [
      {
        moduleKey: MODULE_KEY,
        fieldName: 'field1',
        fieldType: 'string',
        fieldLabel: 'Field 1',
        fieldRequired: true,
        orderIndex: 0,
      },
      {
        moduleKey: MODULE_KEY,
        fieldName: 'field2',
        fieldType: 'number',
        fieldLabel: 'Field 2',
        fieldRequired: false,
        orderIndex: 1,
      },
    ];

    const mockLLMResponse = {
      content: JSON.stringify({
        analysis: 'Test analysis',
        recommendations: ['Rec 1', 'Rec 2'],
        nextSteps: ['Step 1'],
        metrics: { score: 85 },
      }),
      model: 'gpt-4o-mini',
    };

    it('should throw 404 if product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(
        interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY)
      ).rejects.toThrow(new AppError('Producto no encontrado', 404));
    });

    it('should throw 403 if user has no active order', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(false);

      await expect(
        interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY)
      ).rejects.toThrow(new AppError('No tienes acceso a este producto', 403));
    });

    it('should throw 402 if insufficient credits', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 1, expiresAt: new Date() });

      await expect(
        interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY)
      ).rejects.toThrow(new AppError('INTERACTIVE_INSUFFICIENT_CREDITS', 402));

      // Verify no work was done before credit check
      expect(interactiveAgentRepository.findUserData).not.toHaveBeenCalled();
    });

    it('should throw 404 if no data to analyze', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 10, expiresAt: new Date() });
      vi.mocked(interactiveAgentRepository.findUserData).mockResolvedValue([]);

      await expect(
        interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY)
      ).rejects.toThrow(new AppError('No data found for this module — save data first', 404));
    });

    it('should throw 400 if required fields incomplete', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 10, expiresAt: new Date() });
      vi.mocked(interactiveAgentRepository.findUserData).mockResolvedValue([
        {
          ...mockUserData[0],
          inputData: { field2: 42 }, // missing required field1
        },
      ]);
      vi.mocked(interactiveAgentRepository.findFieldsByModule).mockResolvedValue(mockModuleFields);

      await expect(
        interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY)
      ).rejects.toThrow(new AppError('Missing required fields: field1', 400));
    });

    it('should save analysis result to output_analysis', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 10, expiresAt: new Date() });
      vi.mocked(interactiveAgentRepository.findUserData).mockResolvedValue(mockUserData);
      vi.mocked(interactiveAgentRepository.findFieldsByModule).mockResolvedValue(mockModuleFields);
      vi.mocked(llmService.chat).mockResolvedValue(mockLLMResponse);
      vi.mocked(aiCreditService.useCredits).mockResolvedValue({ balance: 7, expires_at: new Date() } as any);
      vi.mocked(interactiveAgentRepository.upsertUserData).mockResolvedValue({ wasInsert: false });

      const result = await interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY);

      expect(result.analysis).toBe('Test analysis');
      expect(result.recommendations).toEqual(['Rec 1', 'Rec 2']);
      expect(result.creditsUsed).toBe(3);
      // upsertUserData called twice: once with completed=false, once with completed=true
      expect(interactiveAgentRepository.upsertUserData).toHaveBeenCalledTimes(2);
    });

    it('should consume 3 credits', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 10, expiresAt: new Date() });
      vi.mocked(interactiveAgentRepository.findUserData).mockResolvedValue(mockUserData);
      vi.mocked(interactiveAgentRepository.findFieldsByModule).mockResolvedValue(mockModuleFields);
      vi.mocked(llmService.chat).mockResolvedValue(mockLLMResponse);
      vi.mocked(aiCreditService.useCredits).mockResolvedValue({ balance: 7, expires_at: new Date() } as any);
      vi.mocked(interactiveAgentRepository.upsertUserData).mockResolvedValue({ wasInsert: false });

      await interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY);

      expect(aiCreditService.useCredits).toHaveBeenCalledWith(
        USER_ID,
        3,
        `Interactive analysis: ${PRODUCT_ID}/${MODULE_KEY}`
      );
    });

    it('should use productRepository.getProductById (not findById)', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 10, expiresAt: new Date() });
      vi.mocked(interactiveAgentRepository.findUserData).mockResolvedValue(mockUserData);
      vi.mocked(interactiveAgentRepository.findFieldsByModule).mockResolvedValue(mockModuleFields);
      vi.mocked(llmService.chat).mockResolvedValue(mockLLMResponse);
      vi.mocked(aiCreditService.useCredits).mockResolvedValue({ balance: 7, expires_at: new Date() } as any);
      vi.mocked(interactiveAgentRepository.upsertUserData).mockResolvedValue({ wasInsert: false });

      await interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY);

      expect(productRepository.getProductById).toHaveBeenCalledWith(PRODUCT_ID);
    });

    it('should fallback gracefully on LLM parse error', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 10, expiresAt: new Date() });
      vi.mocked(interactiveAgentRepository.findUserData).mockResolvedValue(mockUserData);
      vi.mocked(interactiveAgentRepository.findFieldsByModule).mockResolvedValue(mockModuleFields);
      vi.mocked(llmService.chat).mockResolvedValue({
        content: 'invalid json response',
        model: 'gpt-4o-mini',
      });
      vi.mocked(aiCreditService.useCredits).mockResolvedValue({ balance: 7, expires_at: new Date() } as any);
      vi.mocked(interactiveAgentRepository.upsertUserData).mockResolvedValue({ wasInsert: false });

      const result = await interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY);

      // Should use fallback values
      expect(result.analysis).toBe('Análisis no disponible por el momento.');
      expect(result.recommendations).toEqual(['Intenta nuevamente más tarde']);
    });

    it('should return 400 when LLM output passes JSON.parse but fails outputAnalysisSchema validation', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.hasActiveOrder).mockResolvedValue(true);
      vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 10, expiresAt: new Date() });
      vi.mocked(interactiveAgentRepository.findUserData).mockResolvedValue(mockUserData);
      vi.mocked(interactiveAgentRepository.findFieldsByModule).mockResolvedValue(mockModuleFields);
      // LLM returns valid JSON with nested objects in metrics (violates outputAnalysisValueSchema)
      vi.mocked(llmService.chat).mockResolvedValue({
        content: JSON.stringify({
          analysis: 'Test analysis',
          recommendations: ['Rec 1'],
          nextSteps: ['Step 1'],
          metrics: { score: { nested: 'value' } }, // nested object — not a primitive
        }),
        model: 'gpt-4o-mini',
      });

      // WARNING-2: Service wraps ZodError in AppError — assert specific error, not generic toThrow()
      await expect(
        interactiveAgentService.analyzeData(PRODUCT_ID, USER_ID, MODULE_KEY)
      ).rejects.toThrow(new AppError('Invalid analysis output format', 400));
    });
  });

  // =========================================================================
  // getAnalytics
  // =========================================================================

  describe('getAnalytics', () => {
    it('should throw 404 if product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(
        interactiveAgentService.getAnalytics(PRODUCT_ID, CREATOR_ID)
      ).rejects.toThrow(new AppError('Producto no encontrado', 404));
    });

    it('should throw 403 if user is not product owner', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.isProductOwner).mockResolvedValue(false);

      await expect(
        interactiveAgentService.getAnalytics(PRODUCT_ID, USER_ID)
      ).rejects.toThrow(
        new AppError('Solo el creador del producto puede ver analytics', 403)
      );
    });

    it('should call both getAggregatedStats and countUserStats', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(interactiveAgentRepository.isProductOwner).mockResolvedValue(true);
      vi.mocked(interactiveAgentRepository.getAggregatedStats).mockResolvedValue({
        totalResponses: 100,
        averageCompletion: 0.75,
        fieldStats: [],
      });
      vi.mocked(interactiveAgentRepository.countUserStats).mockResolvedValue({
        distinctUsers: 25,
        completedModules: 50,
      });

      const result = await interactiveAgentService.getAnalytics(PRODUCT_ID, CREATOR_ID);

      expect(interactiveAgentRepository.getAggregatedStats).toHaveBeenCalledWith(PRODUCT_ID);
      expect(interactiveAgentRepository.countUserStats).toHaveBeenCalledWith(PRODUCT_ID);
      expect(result.totalUsers).toBe(25);
      expect(result.completedModules).toBe(50);
      expect(result.averageCompletion).toBe(0.75);
    });
  });
});
