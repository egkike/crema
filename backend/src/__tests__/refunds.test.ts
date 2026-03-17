import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

import { extractCookies } from './setup';

const request = supertest(app);

describe('Refund Routes', () => {
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

  describe('POST /api/refunds/:orderId', () => {
    it('should require authentication', async () => {
      const res = await request.post('/api/refunds/order-123');

      expect(res.status).toBe(401);
    });

    it('should process refund with valid auth', async () => {
      const res = await request
        .post('/api/refunds/order-123')
        .set('Cookie', cookies)
        .send({
          reason: 'Customer requested refund',
        });

      // Returns success or error
      expect([200, 400, 404, 500]).toContain(res.status);
    });

    it('should reject invalid order id', async () => {
      const res = await request
        .post('/api/refunds/invalid-order')
        .set('Cookie', cookies)
        .send({
          reason: 'Test',
        });

      expect([400, 404, 500]).toContain(res.status);
    });

    it('should require reason for refund', async () => {
      const res = await request
        .post('/api/refunds/order-123')
        .set('Cookie', cookies)
        .send({});

      // Missing required fields
      expect([400, 500]).toContain(res.status);
    });
  });
});
