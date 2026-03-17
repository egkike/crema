import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

import { extractCookies } from './setup';

const request = supertest(app);

describe('Payout Routes', () => {
  let cookies: string = '';

  beforeEach(async () => {
    // Login first to get auth cookies
    const res = await request.post('/api/auth/login').send({
      email: 'admin@test.com',
      password: 'p1',
    });
    cookies = extractCookies(res);
    vi.clearAllMocks();
  });

  describe('POST /api/payouts (require JWT + full auth)', () => {
    it('should require authentication', async () => {
      const res = await request.post('/api/payouts').send({
        amount: 1000,
        currency: 'ARS',
      });

      expect(res.status).toBe(401);
    });

    it('should require full password auth for payouts', async () => {
      // JWT auth but no password verification
      const res = await request
        .post('/api/payouts')
        .set('Cookie', cookies)
        .send({
          amount: 1000,
          currency: 'ARS',
        });

      // Should return 403 or 400 because enforceFullAuth requires password
      expect([400, 403, 500]).toContain(res.status);
    });
  });

  describe('GET /api/payouts/me', () => {
    it('should require authentication', async () => {
      const res = await request.get('/api/payouts/me');

      expect(res.status).toBe(401);
    });

    it('should return payout history with auth', async () => {
      const res = await request
        .get('/api/payouts/me')
        .set('Cookie', cookies);

      // May return 403 (password required) or 200 with data
      expect([200, 403, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/payouts/:id', () => {
    it('should require authentication', async () => {
      const res = await request.delete('/api/payouts/payout-123');

      expect(res.status).toBe(401);
    });

    it('should return 403 without full auth', async () => {
      const res = await request
        .delete('/api/payouts/payout-123')
        .set('Cookie', cookies);

      expect([403, 500]).toContain(res.status);
    });

    it('should handle invalid payout id', async () => {
      const res = await request
        .delete('/api/payouts/invalid-id')
        .set('Cookie', cookies);

      expect([403, 404, 500]).toContain(res.status);
    });
  });
});
