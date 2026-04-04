import { describe, it, expect } from 'vitest';

describe('QAService', () => {
  it('should export qa service', async () => {
    const service = await import('../../../services/ai/qa.service');
    expect(service.qaService).toBeDefined();
  });
});
