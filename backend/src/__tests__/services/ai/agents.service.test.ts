import { describe, it, expect } from 'vitest';

describe('AgentsService', () => {
  it('should export agents service', async () => {
    const service = await import('../../../services/ai/agents.service');
    expect(service.qaAgentService).toBeDefined();
  });
});
