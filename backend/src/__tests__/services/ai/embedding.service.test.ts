import { describe, it, expect } from 'vitest';

describe('EmbeddingService', () => {
  it('should export embedding service', async () => {
    const service = await import('../../../services/ai/embedding.service');
    expect(service.embeddingService).toBeDefined();
  });
});
