import { describe, it, expect } from 'vitest';

import {
  churnPredictionSchema,
  recoveryEmailSchema,
  compareSchema,
} from '../../schemas/ai.schema';

describe('ai.schema — Insights schemas', () => {
  describe('churnPredictionSchema', () => {
    it('should accept valid productId with optional threshold', () => {
      const result = churnPredictionSchema.safeParse({
        productId: '550e8400-e29b-41d4-a716-446655440000',
        threshold: 75,
      });

      expect(result.success).toBe(true);
    });

    it('should accept valid productId without threshold (uses default)', () => {
      const result = churnPredictionSchema.safeParse({
        productId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.threshold).toBe(50);
      }
    });

    it('should reject invalid productId', () => {
      const result = churnPredictionSchema.safeParse({
        productId: 'not-a-uuid',
      });

      expect(result.success).toBe(false);
    });

    it('should reject threshold out of range', () => {
      const result = churnPredictionSchema.safeParse({
        productId: '550e8400-e29b-41d4-a716-446655440000',
        threshold: 150,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('recoveryEmailSchema', () => {
    it('should accept valid productId and targetUserId with optional tone', () => {
      const result = recoveryEmailSchema.safeParse({
        productId: '550e8400-e29b-41d4-a716-446655440000',
        targetUserId: '660e8400-e29b-41d4-a716-446655440001',
        tone: 'direct',
      });

      expect(result.success).toBe(true);
    });

    it('should accept without tone (uses default empathic)', () => {
      const result = recoveryEmailSchema.safeParse({
        productId: '550e8400-e29b-41d4-a716-446655440000',
        targetUserId: '660e8400-e29b-41d4-a716-446655440001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tone).toBe('empathic');
      }
    });

    it('should reject invalid tone value', () => {
      const result = recoveryEmailSchema.safeParse({
        productId: '550e8400-e29b-41d4-a716-446655440000',
        targetUserId: '660e8400-e29b-41d4-a716-446655440001',
        tone: 'aggressive',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('compareSchema', () => {
    it('should accept valid period comparison', () => {
      const result = compareSchema.safeParse({
        entityType: 'period',
        entityA: '2024-01',
        entityB: '2024-02',
        metrics: ['revenue', 'sales'],
      });

      expect(result.success).toBe(true);
    });

    it('should accept valid product comparison', () => {
      const result = compareSchema.safeParse({
        entityType: 'product',
        entityA: '550e8400-e29b-41d4-a716-446655440000',
        entityB: '660e8400-e29b-41d4-a716-446655440001',
        metrics: ['conversion', 'engagement', 'reviews'],
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid entityType', () => {
      const result = compareSchema.safeParse({
        entityType: 'invalid',
        entityA: 'a',
        entityB: 'b',
        metrics: ['revenue'],
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty metrics array', () => {
      const result = compareSchema.safeParse({
        entityType: 'period',
        entityA: 'a',
        entityB: 'b',
        metrics: [],
      });

      expect(result.success).toBe(false);
    });

    it('should reject more than 5 metrics', () => {
      const result = compareSchema.safeParse({
        entityType: 'period',
        entityA: 'a',
        entityB: 'b',
        metrics: ['revenue', 'sales', 'conversion', 'engagement', 'reviews', 'extra'],
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid metric name', () => {
      const result = compareSchema.safeParse({
        entityType: 'period',
        entityA: 'a',
        entityB: 'b',
        metrics: ['revenue', 'invalid_metric'],
      });

      expect(result.success).toBe(false);
    });

    it('should reject duplicate metrics', () => {
      const result = compareSchema.safeParse({
        entityType: 'period',
        entityA: '2024-01',
        entityB: '2024-02',
        metrics: ['revenue', 'revenue'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-UUID entityA for product type', () => {
      const result = compareSchema.safeParse({
        entityType: 'product',
        entityA: 'not-a-uuid',
        entityB: '550e8400-e29b-41d4-a716-446655440000',
        metrics: ['revenue'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-UUID entityB for product type', () => {
      const result = compareSchema.safeParse({
        entityType: 'product',
        entityA: '550e8400-e29b-41d4-a716-446655440000',
        entityB: 'not-a-uuid',
        metrics: ['revenue'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject both non-UUID entityA and entityB for product type', () => {
      const result = compareSchema.safeParse({
        entityType: 'product',
        entityA: 'not-a-uuid-a',
        entityB: 'not-a-uuid-b',
        metrics: ['revenue'],
      });
      expect(result.success).toBe(false);
    });

    it('should accept exactly 5 valid unique metrics', () => {
      const result = compareSchema.safeParse({
        entityType: 'period',
        entityA: '2024-01',
        entityB: '2024-02',
        metrics: ['revenue', 'sales', 'conversion', 'engagement', 'reviews'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject whitespace-only entityA', () => {
      const result = compareSchema.safeParse({
        entityType: 'period',
        entityA: '   ',
        entityB: '2024-02',
        metrics: ['revenue'],
      });
      expect(result.success).toBe(false);
    });
  });
});
