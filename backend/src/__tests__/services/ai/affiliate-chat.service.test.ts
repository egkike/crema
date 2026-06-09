import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  affiliateChatService,
  sanitizeInput,
  defensiveFramePrompt,
  classifyIntent,
} from '../../../services/ai/affiliate-chat.service';
import { memoryService } from '../../../services/ai/memory.service';
import { llmService } from '../../../services/ai/llm.service';
import logger from '../../../utils/logger';
import { AppError } from '../../../errors/AppError';
import pool from '../../../db/postgres';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../services/ai/memory.service', () => ({
  memoryService: {
    searchSimilar: vi.fn(),
  },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn(),
    buildPrompt: vi.fn((systemPrompt, context, userMessage) => [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: context },
      { role: 'user', content: userMessage },
    ]),
  },
}));

vi.mock('../../../services/config.service', () => ({
  configService: {
    getNumber: vi.fn().mockResolvedValue(0.7),
    get: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../../db/postgres', () => ({
  default: {
    query: vi.fn(),
  },
}));

vi.mock('../../../utils/validators.util', () => ({
  getValidatedSchema: vi.fn().mockReturnValue('public'),
}));

vi.mock('../../../utils/routeHelpers.util', () => ({
  verifyProductAccess: vi.fn().mockResolvedValue(undefined),
}));

// ============================================================================
// Test constants
// ============================================================================

const USER_ID = '00000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';

// ============================================================================
// Tests
// ============================================================================

describe('affiliateChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // sanitizeInput
  // =========================================================================

  describe('sanitizeInput', () => {
    it('should strip control characters', () => {
      // Characters below code 32 and DEL (127) should be removed
      const input = 'hello\x00\x01\x02\x1fworld\x7f';
      const result = sanitizeInput(input);

      expect(result).toBe('helloworld');
    });

    it('should preserve normal text', () => {
      const input = 'Hello, this is a normal message with numbers 123 and symbols @#$!';
      const result = sanitizeInput(input);

      expect(result).toBe(input);
    });
  });

  // =========================================================================
  // defensiveFramePrompt
  // =========================================================================

  describe('defensiveFramePrompt', () => {
    it('should escape < and > characters', () => {
      const result = defensiveFramePrompt('use <script>alert(1)</script>');

      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should wrap message in <user_message> tags', () => {
      const result = defensiveFramePrompt('hello world');

      expect(result).toBe('<user_message>hello world</user_message>');
    });
  });

  // =========================================================================
  // classifyIntent
  // =========================================================================

  describe('classifyIntent', () => {
    it('should map promo keywords to promo_copy', () => {
      expect(classifyIntent('genera copy para mi producto')).toBe('promo_copy');
      expect(classifyIntent('necesito un tweet')).toBe('promo_copy');
      expect(classifyIntent('post para redes sociales')).toBe('promo_copy');
    });

    it('should map metric keywords to affiliate_metrics', () => {
      expect(classifyIntent('cuanto son mis comisiones')).toBe('affiliate_metrics');
      expect(classifyIntent('ver metricas de ventas')).toBe('affiliate_metrics');
      expect(classifyIntent('tasa de conversiones')).toBe('affiliate_metrics');
    });

    it('should default to product_info for ambiguous input', () => {
      expect(classifyIntent('dime mas sobre el producto')).toBe('product_info');
      expect(classifyIntent('que incluye este curso')).toBe('product_info');
      expect(classifyIntent('hola')).toBe('product_info');
    });
  });

  // =========================================================================
  // chat
  // =========================================================================

  describe('chat', () => {
    const mockFragments = [
      {
        id: 'frag-1',
        source_type: 'lesson' as const,
        source_id: 'lesson-1',
        content: 'This product teaches TypeScript fundamentals.',
        metadata: {},
        similarity: 0.95,
      },
    ];

    const mockLLMResponse = {
      content: 'Este producto ensena fundamentos de TypeScript.',
      model: 'gpt-4o-mini',
    };

    it('should return product_info response', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
      vi.mocked(memoryService.searchSimilar).mockResolvedValue(mockFragments);
      vi.mocked(llmService.chat).mockResolvedValue(mockLLMResponse);

      const result = await affiliateChatService.chat({
        productId: PRODUCT_ID,
        userId: USER_ID,
        message: 'Que ensena este producto?',
      });

      expect(result.response).toBe('Este producto ensena fundamentos de TypeScript.');
      expect(result.sources).toHaveLength(1);
      expect(result.sources?.[0].source_type).toBe('lesson');
      expect(result.sources?.[0].source_id).toBe('lesson-1');
    });

    it('should return promo_copy response with marketing prompt', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
      vi.mocked(memoryService.searchSimilar).mockResolvedValue(mockFragments);
      vi.mocked(llmService.chat).mockResolvedValue(mockLLMResponse);

      await affiliateChatService.chat({
        productId: PRODUCT_ID,
        userId: USER_ID,
        message: 'Genera un tweet sobre este producto',
      });

      // Verify buildPrompt was called — system prompt should be the promo copy prompt
      const buildPromptCalls = vi.mocked(llmService.buildPrompt).mock.calls;
      expect(buildPromptCalls.length).toBe(1);
      const systemPrompt = buildPromptCalls[0][0];
      expect(systemPrompt).toContain('marketing copywriter');
    });

    it('should return stub for affiliate_metrics without LLM call', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
      vi.mocked(memoryService.searchSimilar).mockResolvedValue(mockFragments);

      const result = await affiliateChatService.chat({
        productId: PRODUCT_ID,
        userId: USER_ID,
        message: 'Cuales son mis comisiones?',
      });

      expect(result.response).toContain('Metricas detalladas no disponibles');
      expect(result.sources).toEqual([]);
      expect(llmService.chat).not.toHaveBeenCalled();
    });

    it('should log warning but continue processing when input sanitized more than 10%', async () => {
      // Input with many control characters — >10% will be stripped
      const maliciousInput = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09hello';

      const warnSpy = vi.spyOn(logger, 'warn');
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
      vi.mocked(memoryService.searchSimilar).mockResolvedValue(mockFragments);
      vi.mocked(llmService.chat).mockResolvedValue(mockLLMResponse);

      const result = await affiliateChatService.chat({
        productId: PRODUCT_ID,
        userId: USER_ID,
        message: maliciousInput,
      });

      // Processing continues with sanitized input
      expect(result.response).toBe('Este producto ensena fundamentos de TypeScript.');

      // Warning was logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          productId: PRODUCT_ID,
        }),
        expect.stringContaining('possible injection attempt')
      );
    });

    it('should handle empty RAG results', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
      vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);
      vi.mocked(llmService.chat).mockResolvedValue(mockLLMResponse);

      const result = await affiliateChatService.chat({
        productId: PRODUCT_ID,
        userId: USER_ID,
        message: 'Que incluye este producto?',
      });

      // Context should state no product context available
      const buildPromptCalls = vi.mocked(llmService.buildPrompt).mock.calls;
      const context = buildPromptCalls[0][1];
      expect(context).toContain('No se encontro contexto relevante');
      expect(result.sources).toEqual([]);
    });

    it('should throw 503 with generic message on LLM timeout', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
      vi.mocked(memoryService.searchSimilar).mockResolvedValue(mockFragments);
      vi.mocked(llmService.chat).mockRejectedValue(new Error('LLM provider timeout'));

      await expect(
        affiliateChatService.chat({
          productId: PRODUCT_ID,
          userId: USER_ID,
          message: 'Que ensena este producto?',
        })
      ).rejects.toThrow(new AppError('Servicio temporalmente no disponible', 503));
    });

    it('should throw 500 with generic message on non-timeout LLM errors', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
      vi.mocked(memoryService.searchSimilar).mockResolvedValue(mockFragments);
      vi.mocked(llmService.chat).mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(
        affiliateChatService.chat({
          productId: PRODUCT_ID,
          userId: USER_ID,
          message: 'Que ensena este producto?',
        })
      ).rejects.toThrow(new AppError('Error al procesar la solicitud. Por favor intenta de nuevo.', 500));
    });

    it('should throw 404 when product does not exist', async () => {
      // Override the existence check to return empty rows
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

      await expect(
        affiliateChatService.chat({
          productId: PRODUCT_ID,
          userId: USER_ID,
          message: 'test',
        })
      ).rejects.toThrow(new AppError('Producto no encontrado', 404));

      // Assert RAG search was NOT called
      expect(memoryService.searchSimilar).not.toHaveBeenCalled();
    });

    it('should throw 403 when user has no product access', async () => {
      // Existence check returns row (product exists)
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);
      // verifyProductAccess throws 403
      const { verifyProductAccess } = await import('../../../utils/routeHelpers.util');
      vi.mocked(verifyProductAccess).mockRejectedValueOnce(
        new AppError('You do not have access to this product. Purchase required.', 403)
      );

      await expect(
        affiliateChatService.chat({
          productId: PRODUCT_ID,
          userId: USER_ID,
          message: 'test',
        })
      ).rejects.toThrow('You do not have access to this product');

      expect(memoryService.searchSimilar).not.toHaveBeenCalled();
    });
  });
});
