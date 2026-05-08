import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AppError } from '../../../errors/AppError';

// Mock DB pool — same pattern as product.repository.test.ts
const mockPoolQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockClientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

vi.mock('../../../db/postgres', () => ({
  default: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: () => ({
      query: (...args2: unknown[]) => mockClientQuery(...args2),
      release: vi.fn(),
    }),
  },
}));

vi.mock('../../../config/index', () => ({
  config: { db: { schema: 'public' } },
}));

vi.mock('../../../utils/validators.util', () => ({
  getValidatedSchema: () => 'public',
}));

vi.mock('../../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Import after mocks
import { interactiveAgentRepository } from '../../../repositories/ai/interactive-agent.repository';

describe('interactiveAgentRepository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // findFieldsByProduct
  // =========================================================================

  describe('findFieldsByProduct', () => {
    it('should return grouped field configs', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [
          {
            module_key: 'module_a',
            field_name: 'field1',
            field_type: 'string',
            field_label: 'Field 1',
            field_placeholder: null,
            field_options: null,
            field_required: true,
            field_validation: null,
            order_index: 0,
          },
          {
            module_key: 'module_a',
            field_name: 'field2',
            field_type: 'number',
            field_label: 'Field 2',
            field_placeholder: 'Enter a number',
            field_options: null,
            field_required: false,
            field_validation: null,
            order_index: 1,
          },
        ],
      });

      const result = await interactiveAgentRepository.findFieldsByProduct('prod-1');

      expect(result).toHaveLength(2);
      expect(result[0].moduleKey).toBe('module_a');
      expect(result[0].fieldName).toBe('field1');
      expect(result[0].fieldType).toBe('string');
    });

    it('should filter out invalid field_type rows', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [
          {
            module_key: 'module_a',
            field_name: 'valid_field',
            field_type: 'string',
            field_label: 'Valid',
            field_placeholder: null,
            field_options: null,
            field_required: false,
            field_validation: null,
            order_index: 0,
          },
          {
            module_key: 'module_a',
            field_name: 'invalid_field',
            field_type: 'invalid_type',
            field_label: 'Invalid',
            field_placeholder: null,
            field_options: null,
            field_required: false,
            field_validation: null,
            order_index: 1,
          },
        ],
      });

      const result = await interactiveAgentRepository.findFieldsByProduct('prod-1');

      expect(result).toHaveLength(1);
      expect(result[0].fieldName).toBe('valid_field');
    });

    it('should return empty array when no fields exist', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await interactiveAgentRepository.findFieldsByProduct('prod-1');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // upsertFields
  // =========================================================================

  describe('upsertFields', () => {
    const validFields = [
      {
        fieldName: 'test_field',
        fieldType: 'string' as const,
        fieldLabel: 'Test Field',
        fieldPlaceholder: null,
        fieldOptions: null,
        fieldRequired: false,
        fieldValidation: null,
        orderIndex: 0,
      },
    ];

    it('should throw 400 if field count > 50', async () => {
      const tooManyFields = Array.from({ length: 51 }, (_, i) => ({
        fieldName: `field_${i}`,
        fieldType: 'string' as const,
        fieldLabel: `Field ${i}`,
      }));

      await expect(
        interactiveAgentRepository.upsertFields('prod-1', 'module_a', tooManyFields)
      ).rejects.toThrow(new AppError('Maximum 50 fields per module', 400));
    });

    it('should throw 400 if fieldName exceeds 100 chars', async () => {
      const longNameField = [
        {
          fieldName: 'a'.repeat(101),
          fieldType: 'string' as const,
          fieldLabel: 'Test',
        },
      ];

      await expect(
        interactiveAgentRepository.upsertFields('prod-1', 'module_a', longNameField)
      ).rejects.toThrow(new AppError('Field name or label exceeds maximum length', 400));
    });

    it('should throw 400 if fieldLabel exceeds 200 chars', async () => {
      const longLabelField = [
        {
          fieldName: 'test',
          fieldType: 'string' as const,
          fieldLabel: 'a'.repeat(201),
        },
      ];

      await expect(
        interactiveAgentRepository.upsertFields('prod-1', 'module_a', longLabelField)
      ).rejects.toThrow(new AppError('Field name or label exceeds maximum length', 400));
    });

    it('should throw 400 if empty fields array', async () => {
      await expect(
        interactiveAgentRepository.upsertFields('prod-1', 'module_a', [])
      ).rejects.toThrow(new AppError('At least one field is required', 400));
    });

    it('should acquire advisory lock before delete/insert', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ acquired: true }] }) // lock
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await interactiveAgentRepository.upsertFields('prod-1', 'module_a', validFields);

      // Second client query should be the advisory lock (first is BEGIN)
      const lockCall = mockClientQuery.mock.calls[1];
      expect(lockCall[0]).toContain('pg_try_advisory_xact_lock');
    });

    it('should throw 409 if lock not acquired', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ acquired: false }] }) // lock → throws 409
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK (called before throw)

      await expect(
        interactiveAgentRepository.upsertFields('prod-1', 'module_a', validFields)
      ).rejects.toThrow(new AppError('Resource temporarily locked — try again', 409));
    });

    it('should throw 400 if invalid field type', async () => {
      const invalidTypeField = [
        {
          fieldName: 'test',
          fieldType: 'invalid' as any,
          fieldLabel: 'Test',
        },
      ];

      await expect(
        interactiveAgentRepository.upsertFields('prod-1', 'module_a', invalidTypeField)
      ).rejects.toThrow(new AppError('Invalid field type: invalid', 400));
    });

    it('should throw 400 if invalid field name format', async () => {
      const invalidNameField = [
        {
          fieldName: 'Invalid-Name',
          fieldType: 'string' as const,
          fieldLabel: 'Test',
        },
      ];

      await expect(
        interactiveAgentRepository.upsertFields('prod-1', 'module_a', invalidNameField)
      ).rejects.toThrow(new AppError('Invalid field name: Invalid-Name', 400));
    });
  });

  // =========================================================================
  // upsertUserData
  // =========================================================================

  describe('upsertUserData', () => {
    it('should return wasInsert=true on INSERT', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ acquired: true }] }) // lock
        .mockResolvedValueOnce({ rows: [{ was_insert: true }] }) // INSERT ... RETURNING
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await interactiveAgentRepository.upsertUserData(
        'user-1',
        'prod-1',
        'module_a',
        { field1: 'value1' }
      );

      expect(result.wasInsert).toBe(true);
    });

    it('should return wasInsert=false on UPDATE', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ acquired: true }] }) // lock
        .mockResolvedValueOnce({ rows: [{ was_insert: false }] }) // INSERT ... RETURNING
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await interactiveAgentRepository.upsertUserData(
        'user-1',
        'prod-1',
        'module_a',
        { field1: 'updated' }
      );

      expect(result.wasInsert).toBe(false);
    });

    it('should throw if inputData is too large', async () => {
      const largeData: Record<string, unknown> = {};
      for (let i = 0; i < 12000; i++) {
        largeData[`key_${i}`] = 'x'.repeat(10);
      }

      await expect(
        interactiveAgentRepository.upsertUserData('user-1', 'prod-1', 'module_a', largeData)
      ).rejects.toThrow(AppError);
    });

    it('should throw 409 if lock not acquired', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ acquired: false }] }) // lock → throws 409
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK (called before throw)

      await expect(
        interactiveAgentRepository.upsertUserData('user-1', 'prod-1', 'module_a', { key: 'val' })
      ).rejects.toThrow(new AppError('Resource temporarily locked — try again', 409));
    });
  });

  // =========================================================================
  // getAggregatedStats
  // =========================================================================

  describe('getAggregatedStats', () => {
    it('should set statement_timeout before query', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL statement_timeout
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL idle_in_transaction_session_timeout
        .mockResolvedValueOnce({ rows: [{ total_responses: 10, average_completion: 0.5 }] }) // stats
        .mockResolvedValueOnce({ rows: [] }) // field stats
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({ rows: [] }) // RESET statement_timeout
        .mockResolvedValueOnce({ rows: [] }); // RESET idle_in_transaction_session_timeout

      await interactiveAgentRepository.getAggregatedStats('prod-1');

      const calls = mockClientQuery.mock.calls.map((c) => c[0]);
      expect(calls.some((c: string) => c.includes('SET LOCAL statement_timeout'))).toBe(true);
    });

    it('should throw AppError(504) on timeout', async () => {
      const timeoutError = new Error('canceling statement due to statement timeout') as Error & { code: string };
      timeoutError.code = '57014';

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL statement_timeout
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL idle_in_transaction_session_timeout
        .mockRejectedValueOnce(timeoutError);

      await expect(
        interactiveAgentRepository.getAggregatedStats('prod-1')
      ).rejects.toThrow(new AppError('Analytics query timed out for product prod-1 — too much data', 504));
    });

    it('should return stats with default values when no data', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL statement_timeout
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL idle_in_transaction_session_timeout
        .mockResolvedValueOnce({ rows: [{ total_responses: 0, average_completion: null }] }) // stats
        .mockResolvedValueOnce({ rows: [] }) // field stats
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({ rows: [] }) // RESET
        .mockResolvedValueOnce({ rows: [] }); // RESET

      const result = await interactiveAgentRepository.getAggregatedStats('prod-1');

      expect(result.totalResponses).toBe(0);
      expect(result.averageCompletion).toBe(0);
      expect(result.fieldStats).toEqual([]);
    });
  });

  // =========================================================================
  // countUserStats
  // =========================================================================

  describe('countUserStats', () => {
    it('should set both statement_timeout and idle_in_transaction_session_timeout', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL statement_timeout
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL idle_in_transaction_session_timeout
        .mockResolvedValueOnce({ rows: [{ distinct_users: '10', completed_modules: '5' }] })
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({ rows: [] }) // RESET
        .mockResolvedValueOnce({ rows: [] }); // RESET

      await interactiveAgentRepository.countUserStats('prod-1');

      const calls = mockClientQuery.mock.calls.map((c) => c[0]);
      expect(calls.some((c: string) => c.includes('SET LOCAL statement_timeout'))).toBe(true);
      expect(
        calls.some((c: string) => c.includes('SET LOCAL idle_in_transaction_session_timeout'))
      ).toBe(true);
    });

    it('should throw AppError(504) on timeout', async () => {
      const timeoutError = new Error('canceling statement due to statement timeout') as Error & { code: string };
      timeoutError.code = '57014';

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL statement_timeout
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL idle_in_transaction_session_timeout
        .mockRejectedValueOnce(timeoutError);

      await expect(
        interactiveAgentRepository.countUserStats('prod-1')
      ).rejects.toThrow(new AppError('Analytics query timed out for product prod-1 — too much data', 504));
    });

    it('should return counts correctly', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL statement_timeout
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL idle_in_transaction_session_timeout
        .mockResolvedValueOnce({ rows: [{ distinct_users: '25', completed_modules: '50' }] })
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({ rows: [] }) // RESET
        .mockResolvedValueOnce({ rows: [] }); // RESET

      const result = await interactiveAgentRepository.countUserStats('prod-1');

      expect(result.distinctUsers).toBe(25);
      expect(result.completedModules).toBe(50);
    });
  });

  // =========================================================================
  // hasProductAccess
  // =========================================================================

  describe('hasProductAccess', () => {
    it('should return true if user is owner', async () => {
      vi.spyOn(interactiveAgentRepository, 'isProductOwner').mockResolvedValue(true);
      vi.spyOn(interactiveAgentRepository, 'hasActiveOrder').mockResolvedValue(false);

      const result = await interactiveAgentRepository.hasProductAccess('user-1', 'prod-1');

      expect(result).toBe(true);
    });

    it('should return true if user has active order', async () => {
      vi.spyOn(interactiveAgentRepository, 'isProductOwner').mockResolvedValue(false);
      vi.spyOn(interactiveAgentRepository, 'hasActiveOrder').mockResolvedValue(true);

      const result = await interactiveAgentRepository.hasProductAccess('user-1', 'prod-1');

      expect(result).toBe(true);
    });

    it('should return false otherwise', async () => {
      vi.spyOn(interactiveAgentRepository, 'isProductOwner').mockResolvedValue(false);
      vi.spyOn(interactiveAgentRepository, 'hasActiveOrder').mockResolvedValue(false);

      const result = await interactiveAgentRepository.hasProductAccess('user-1', 'prod-1');

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // isProductOwner
  // =========================================================================

  describe('isProductOwner', () => {
    it('should return true when user is owner', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      const result = await interactiveAgentRepository.isProductOwner('creator-1', 'prod-1');

      expect(result).toBe(true);
    });

    it('should return false when user is not owner', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await interactiveAgentRepository.isProductOwner('user-1', 'prod-1');

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // hasActiveOrder
  // =========================================================================

  describe('hasActiveOrder', () => {
    it('should return true when user has paid order', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      const result = await interactiveAgentRepository.hasActiveOrder('user-1', 'prod-1');

      expect(result).toBe(true);
    });

    it('should return false when no paid order', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await interactiveAgentRepository.hasActiveOrder('user-1', 'prod-1');

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // findUserData
  // =========================================================================

  describe('findUserData', () => {
    it('should return user data with module filter', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [
          {
            id: 'data-1',
            user_id: 'user-1',
            product_id: 'prod-1',
            module_key: 'module_a',
            input_data: { field1: 'value1' },
            output_analysis: null,
            completed: false,
            completed_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const result = await interactiveAgentRepository.findUserData('user-1', 'prod-1', 'module_a');

      expect(result).toHaveLength(1);
      expect(result[0].moduleKey).toBe('module_a');
      expect(result[0].inputData).toEqual({ field1: 'value1' });
    });

    it('should throw 400 on invalid module key format', async () => {
      await expect(
        interactiveAgentRepository.findUserData('user-1', 'prod-1', 'INVALID-KEY')
      ).rejects.toThrow(new AppError('Invalid module key format', 400));
    });

    it('should return empty array when no data', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await interactiveAgentRepository.findUserData('user-1', 'prod-1');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // userDataExists
  // =========================================================================

  describe('userDataExists', () => {
    it('should return true when data exists', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      const result = await interactiveAgentRepository.userDataExists('user-1', 'prod-1', 'module_a');

      expect(result).toBe(true);
    });

    it('should return false when no data', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await interactiveAgentRepository.userDataExists('user-1', 'prod-1', 'module_a');

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // mapFieldConfigRow
  // =========================================================================

  describe('mapFieldConfigRow', () => {
    it('should map snake_case to camelCase', () => {
      const row = {
        module_key: 'module_a',
        field_name: 'test_field',
        field_type: 'string',
        field_label: 'Test Field',
        field_placeholder: 'Enter value',
        field_options: null,
        field_required: true,
        field_validation: null,
        order_index: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const result = interactiveAgentRepository.mapFieldConfigRow(row as any);

      expect(result.moduleKey).toBe('module_a');
      expect(result.fieldName).toBe('test_field');
      expect(result.fieldType).toBe('string');
      expect(result.fieldLabel).toBe('Test Field');
      expect(result.fieldPlaceholder).toBe('Enter value');
      expect(result.fieldRequired).toBe(true);
      expect(result.orderIndex).toBe(0);
    });

    it('should throw 500 on invalid field_type', () => {
      const row = {
        module_key: 'module_a',
        field_name: 'test',
        field_type: 'invalid',
        field_label: 'Test',
        field_placeholder: null,
        field_options: null,
        field_required: false,
        field_validation: null,
        order_index: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(() => interactiveAgentRepository.mapFieldConfigRow(row as any)).toThrow(
        new AppError('Invalid field configuration in database', 500, false)
      );
    });
  });

  // =========================================================================
  // mapUserDataRow
  // =========================================================================

  describe('mapUserDataRow', () => {
    it('should map snake_case to camelCase', () => {
      const now = new Date();
      const row = {
        id: 'data-1',
        user_id: 'user-1',
        product_id: 'prod-1',
        module_key: 'module_a',
        input_data: { field1: 'value1' },
        output_analysis: { analysis: 'test' },
        completed: true,
        completed_at: now,
        created_at: now,
        updated_at: now,
      };

      const result = interactiveAgentRepository.mapUserDataRow(row as any);

      expect(result.id).toBe('data-1');
      expect(result.userId).toBe('user-1');
      expect(result.productId).toBe('prod-1');
      expect(result.moduleKey).toBe('module_a');
      expect(result.inputData).toEqual({ field1: 'value1' });
      expect(result.outputAnalysis).toEqual({ analysis: 'test' });
      expect(result.completed).toBe(true);
    });

    it('should handle null output_analysis', () => {
      const now = new Date();
      const row = {
        id: 'data-1',
        user_id: 'user-1',
        product_id: 'prod-1',
        module_key: 'module_a',
        input_data: {},
        output_analysis: null,
        completed: false,
        completed_at: null,
        created_at: now,
        updated_at: now,
      };

      const result = interactiveAgentRepository.mapUserDataRow(row as any);

      expect(result.outputAnalysis).toBeUndefined();
      expect(result.completedAt).toBeNull();
    });
  });
});
