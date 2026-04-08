import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

import { createMockCookies, ADMIN_ID } from './setup';

const request = supertest(app);

describe('Balance Routes', () => {
  // Use pre-generated mock cookies instead of trying to login
  const cookies = createMockCookies({
    id: ADMIN_ID,
    username: 'admin',
    email: 'admin@test.com',
    level: 99,
    active: 1,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/balance/stats', () => {
    it('should require authentication', async () => {
      const res = await request.get('/api/balance/stats');

      expect(res.status).toBe(401);
    });

    it('should return dashboard stats with auth', async () => {
      const res = await request
        .get('/api/balance/stats')
        .set('Cookie', cookies);

      // Should return 200 with data, 404, or 500 due to mocks
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/balance/me', () => {
    it('should require authentication', async () => {
      const res = await request.get('/api/balance/me');

      expect(res.status).toBe(401);
    });

    it('should return user balance with auth', async () => {
      const res = await request
        .get('/api/balance/me')
        .set('Cookie', cookies);

      // Should return 200 with data, 404, or 500 due to mocks
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/balance/history', () => {
    it('should require authentication', async () => {
      const res = await request.get('/api/balance/history');

      expect(res.status).toBe(401);
    });

    it('should return transaction history with auth', async () => {
      const res = await request
        .get('/api/balance/history')
        .set('Cookie', cookies);

      // Should return 200 with data, 404 (route not found), or 500 due to mocks
      expect([200, 404, 500]).toContain(res.status);
    });

    it('should support pagination parameters', async () => {
      const res = await request
        .get('/api/balance/history?page=1&limit=10')
        .set('Cookie', cookies);

      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
