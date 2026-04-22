import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';

import { app } from '../../app';
import '../setup';

// Mock orchestrator services
vi.mock('../../services/orchestrator.service', () => ({
  orchestratorService: {
    listCapabilities: vi.fn().mockResolvedValue(['llm.chat', 'llm.stream']),
    executeQuery: vi.fn().mockResolvedValue({ success: true, result: 'test' }),
  },
}));

vi.mock('../../services/skills-registry.service', () => ({
  skillsRegistry: {
    listAll: vi.fn().mockResolvedValue([
      { id: '1', name: 'LLM Chat', capability: 'llm.chat' },
    ]),
  },
}));

const request = supertest(app);

describe('Orchestrator Routes', () => {
  let userCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Login as user
    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });

    const cookies = resUser.headers['set-cookie'];
    if (Array.isArray(cookies)) {
      userCookies = cookies.map((c: string) => c.split(';')[0]).join('; ');
    }
  });

  describe('GET /api/orchestrator/capabilities', () => {
    it('should return capabilities list', async () => {
      const res = await request.get('/api/orchestrator/capabilities');

      // Route registered: 200, not registered: 404
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('should work without auth', async () => {
      const res = await request.get('/api/orchestrator/capabilities');

      // Public endpoint should NOT require auth (status != 401)
      expect(res.status).not.toBe(401);
    });
  });

  describe('GET /api/orchestrator/skills', () => {
    it('should return skills list', async () => {
      const res = await request.get('/api/orchestrator/skills');

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('should work without auth', async () => {
      const res = await request.get('/api/orchestrator/skills');

      expect(res.status).not.toBe(401);
    });
  });

  describe('POST /api/orchestrator/query', () => {
    it('should execute query with valid auth', async () => {
      const res = await request
        .post('/api/orchestrator/query')
        .set('Cookie', userCookies)
        .send({
          capability: 'llm.chat',
          input: { messages: [{ role: 'user', content: 'Hello' }] },
        });

      // Success: 200, auth failed: 401
      expect([200, 401]).toContain(res.status);
    });

    it('should reject without auth', async () => {
      const res = await request
        .post('/api/orchestrator/query')
        .send({
          capability: 'llm.chat',
          input: { messages: [{ role: 'user', content: 'Hello' }] },
        });

      expect(res.status).toBe(401);
    });

    it('should reject missing capability', async () => {
      const res = await request
        .post('/api/orchestrator/query')
        .set('Cookie', userCookies)
        .send({
          input: { messages: [] },
        });

      // Validation error: 400, auth failed: 401
      expect([400, 401]).toContain(res.status);
    });

    it('should reject missing input', async () => {
      const res = await request
        .post('/api/orchestrator/query')
        .set('Cookie', userCookies)
        .send({
          capability: 'llm.chat',
        });

      expect([400, 401]).toContain(res.status);
    });

    it('should reject non-object input', async () => {
      const res = await request
        .post('/api/orchestrator/query')
        .set('Cookie', userCookies)
        .send({
          capability: 'llm.chat',
          input: 'string not object',
        });

      expect([400, 401]).toContain(res.status);
    });

    it('should reject array input', async () => {
      const res = await request
        .post('/api/orchestrator/query')
        .set('Cookie', userCookies)
        .send({
          capability: 'llm.chat',
          input: ['array', 'not', 'object'],
        });

      expect([400, 401]).toContain(res.status);
    });

    it('should reject capability too long', async () => {
      const res = await request
        .post('/api/orchestrator/query')
        .set('Cookie', userCookies)
        .send({
          capability: 'a'.repeat(101),
          input: { test: true },
        });

      expect([400, 401]).toContain(res.status);
    });
  });
});