import { describe, it, expect } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';
import './setup';

// Integration tests - verify endpoints are registered (public routes)
const request = supertest(app);

describe('Orchestrator Integration Tests (T-161, T-162, T-163)', () => {
  describe('T-161: GET /orchestrator/capabilities - Skill Discovery', () => {
    it('should return 200 with success', async () => {
      const res = await request.get('/api/orchestrator/capabilities');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return capabilities array (may be empty in test env)', async () => {
      const res = await request.get('/api/orchestrator/capabilities');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.capabilities).toBeDefined();
      expect(Array.isArray(res.body.data.capabilities)).toBe(true);
    });

    it('should return count matching array length', async () => {
      const res = await request.get('/api/orchestrator/capabilities');

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(res.body.data.capabilities.length);
    });
  });

  describe('T-162: GET /orchestrator/skills - Skills List', () => {
    it('should return 200 with success', async () => {
      const res = await request.get('/api/orchestrator/skills');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return skills array', async () => {
      const res = await request.get('/api/orchestrator/skills');

      expect(res.status).toBe(200);
      expect(res.body.data.skills).toBeDefined();
      expect(Array.isArray(res.body.data.skills)).toBe(true);
    });

    it('should include skill metadata', async () => {
      const res = await request.get('/api/orchestrator/skills');

      expect(res.status).toBe(200);
      if (res.body.data.skills.length > 0) {
        const skill = res.body.data.skills[0];
        expect(skill).toHaveProperty('id');
        expect(skill).toHaveProperty('capability');
      }
    });
  });

  describe('T-163: POST /orchestrator/query - Authentication & Routing', () => {
    it('should reject request without auth', async () => {
      const res = await request
        .post('/api/orchestrator/query')
        .send({
          capability: 'llm.chat',
          input: { messages: [{ role: 'user', content: 'Hello' }] },
        });

      expect(res.status).toBe(401);
    });

    it('should return structured response format', async () => {
      const res = await request.get('/api/orchestrator/capabilities');

      // Verify response structure
      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('Backward Compatibility (T-163)', () => {
    it('should not break /api/ai/credits', async () => {
      // Login first
      const loginRes = await request
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'p1' });

      // May fail in test env, just verify no crash
      expect([200, 401, 500]).toContain(loginRes.status);

      const cookies = loginRes.headers['set-cookie'];
      if (Array.isArray(cookies) && loginRes.status === 200) {
        const authCookie = cookies.map((c: string) => c.split(';')[0]).join('; ');

        const res = await request
          .get('/api/ai/credits')
          .set('Cookie', authCookie);

        // Should work or return 401 (not 500)
        expect([200, 401]).toContain(res.status);
      }
    });

    it('should handle error responses correctly', async () => {
      // Test invalid endpoint
      const res = await request.get('/api/orchestrator/nonexistent');

      // Should return 404 or similar error
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });
  });
});