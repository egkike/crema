import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';
import { productRepository } from '../repositories/product.repository';
import { configRepository } from '../repositories/config.repository';

import { extractCookies } from './setup';

const request = supertest(app);

describe('Products API', () => {
  let creatorCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    // LOGIN ADMIN
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
    creatorCookies = extractCookies(res);
  });

  it('debería rechazar comisión menor al mínimo permitido', async () => {
    // 1. Forzamos el mínimo en 10% para este test específico
    vi.mocked(configRepository.getSetting).mockResolvedValue('10');

    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Test Product',
        type: 'course',
        currency: 'ARS',
        prices: [{ currency: 'ARS', amount: 100 }],
        commissionPercent: 5, // 5% es menor a 10%, ahora SÍ debería dar 400
        description: 'Descripción de prueba para pasar Zod y validaciones',
        status: 'published',
        contentUrl: 'https://test.com/file.zip',
      });

    // Ahora esperamos el 400 correctamente
    expect(res.status).toBe(400);
    const errorMessage = res.body.message || res.body.error || '';
    expect(errorMessage).toContain('10%');
  });

  it('debería crear producto exitosamente', async () => {
    vi.mocked(productRepository.countPublishedByCreator).mockResolvedValue(0);

    // CAMBIO CLAVE: Enviamos 0.05 (decimal) para que el Service
    // haga 0.05 * 100 = 5%.
    // Si ponemos 5, el service interpreta 500% y explota.
    vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
      fee_percent: 0.05 as any,
    });

    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Curso Pro Vitest',
        type: 'course',
        currency: 'ARS',
        prices: [{ currency: 'ARS', amount: 5000 }],
        commissionPercent: 25,
        description: 'Aprende testing profesional con este curso completo.',
        status: 'published',
        contentUrl: 'https://cdn.test.com/curso.zip',
        hasStructuredContent: false,
      });

    if (res.status !== 201) {
      // Este log te confirmará si el máximo permitido ahora es ~90%
      console.error('NUEVO DEBUG:', res.body.error);
    }

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
