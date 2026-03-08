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
    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Test Product',
        type: 'course',
        currency: 'ARS',
        prices: [{ currency: 'ARS', amount: 5000 }],
        affiliate_commission_percent: 1, // 1% es menor a 5%, ahora SÍ debería dar 400
        description: 'Descripción de prueba para pasar Zod y validaciones',
        status: 'published',
        contentUrl: 'https://test.com/file.zip',
      });

    // Ahora esperamos el 400 correctamente
    expect(res.status).toBe(400);
    const errorMessage = res.body.message || res.body.error || '';
    expect(errorMessage).toContain('5%');
  });

  it('debería crear producto exitosamente', async () => {
    vi.mocked(productRepository.countPublishedByCreator).mockResolvedValue(0);
    vi.mocked(configRepository.getSetting).mockResolvedValue('5');

    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        // Usamos los nombres que espera ProductInput
        title: 'Curso Pro Vitest',
        slug: 'curso-pro-vitest-' + Date.now(), // El repo lo requiere
        type: 'course',
        affiliate_commission_percent: 20, // El repo usa snake_case aquí
        prices: [{ currency: 'ARS', amount: 5000 }],
        description:
          'Esta es una descripción válida con más de veinte caracteres para pasar validaciones.',
        status: 'published',
        contentUrl: 'https://cdn.test.com/curso.zip', // ProductInput usa camelCase
        hasStructuredContent: false, // ProductInput usa camelCase
      });

    if (res.status !== 201) {
      console.error('DETALLE DEL ERROR:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
