import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';
import { AppError } from '../errors/AppError';
import { ProductService } from '../services/product.service';

import { extractCookies } from './setup';

// Mock de servicios
vi.mock('../services/product.service', () => ({
  ProductService: {
    // Usamos undefined porque las funciones void en mocks de Vitest
    // se resuelven como undefined
    validateCommissionLimits: vi.fn().mockResolvedValue(undefined),
  },
}));

const request = supertest(app);

describe('Products API', () => {
  let creatorCookies: string = '';

  beforeEach(async () => {
    // Limpiamos todos los mocks antes de cada test para evitar contaminación
    vi.clearAllMocks();

    // LOGIN ADMIN (Level 99 para pasar restrictTo('CREATOR'))
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
    creatorCookies = extractCookies(res);
  });

  it('debería rechazar comisión menor al 10%', async () => {
    // Forzamos el error en el servicio
    vi.mocked(ProductService.validateCommissionLimits).mockImplementationOnce(() => {
      throw new AppError('Error de validación: comisión mínima 10%', 400);
    });

    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Test Product',
        type: 'course',
        currency: 'ARS',
        prices: [{ currency: 'ARS', amount: 100 }],
        commissionPercent: 5,
        description: 'Descripción de prueba para pasar Zod',
        status: 'published',
        contentUrl: 'https://test.com/file.zip', // <--- AGREGA ESTO PARA QUE ZOD NO SE QUEJE
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('comisión mínima 10%');
  });

  it('debería crear producto exitosamente', async () => {
    // IMPORTANTE: Reseteamos el mock para eliminar la implementación del test anterior
    vi.mocked(ProductService.validateCommissionLimits).mockReset();

    // Ahora definimos el comportamiento de éxito para este test
    vi.mocked(ProductService.validateCommissionLimits).mockResolvedValue(undefined as any);

    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Curso Pro Vitest',
        type: 'course',
        currency: 'ARS',
        prices: [{ currency: 'ARS', amount: 5000 }],
        commissionPercent: 25,
        description: 'Aprende testing profesional',
        status: 'published',
        contentUrl: 'https://cdn.test.com/curso.zip',
        hasStructuredContent: false,
      });

    if (res.status !== 201) {
      console.error('Error de creación detectado:', res.body);
    }

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('new-prod');
  });
});
