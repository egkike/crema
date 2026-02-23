import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';
import { AppError } from '../errors/AppError';
import { ProductService } from '../services/product.service';

import { extractCookies } from './setup';

vi.mock('../services/product.service', () => ({
  ProductService: {
    validateCommissionLimits: vi.fn().mockResolvedValue(true),
  },
}));

const request = supertest(app);

describe('Products API', () => {
  let creatorCookies: string = '';

  beforeEach(async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
    creatorCookies = extractCookies(res);
  });

  it('debería rechazar comisión menor al 10%', async () => {
    vi.mocked(ProductService.validateCommissionLimits).mockImplementationOnce(() => {
      throw new AppError('comisión mínima', 400);
    });

    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Test Product',
        type: 'course',
        prices: [{ currency: 'ARS', amount: 100 }],
        commissionPercent: 5,
        sizeBytes: 0,
      });

    if (res.status !== 400) console.error('Fallo rechazo comisión:', res.body);
    expect(res.status).toBe(400);
  });

  it('debería crear producto exitosamente', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Curso Pro Vitest',
        type: 'course',
        currency: 'ARS', // <--- Importante para el middleware checkPlanLimits
        prices: [{ currency: 'ARS', amount: 5000 }],
        commissionPercent: 25,
        sizeBytes: 100,
        status: 'published',
      });

    expect(res.status).toBe(201);
  });
});
