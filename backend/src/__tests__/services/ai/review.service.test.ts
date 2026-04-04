import { describe, it, expect } from 'vitest';

describe('ReviewService', () => {
  it('should export review service', async () => {
    const service = await import('../../../services/ai/review.service');
    expect(service.reviewService).toBeDefined();
  });
});
