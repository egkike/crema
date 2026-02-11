import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../index';

// --- 1. MOCKS DE INFRAESTRUCTURA (Auth & DB) ---

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../repositories/user.repository', () => ({
  userRepository: {
    findByCredentials: vi.fn(async (identifier: string) => {
      if (identifier === 'admin') {
        return {
          id: 'admin-id-mock',
          username: 'admin',
          password: 'hashed-password',
          level: 5,
          active: 1,
        };
      }
      if (identifier === 'testuser2') {
        return {
          id: 'user-id-mock',
          username: 'testuser2',
          password: 'hashed-password',
          level: 1,
          active: 1,
        };
      }
      return null;
    }),
    saveRefreshToken: vi.fn(async () => ({ success: true })),
    getById: vi.fn(async (id: string) => ({
      id,
      username: id === 'admin-id-mock' ? 'admin' : 'testuser2',
      level: id === 'admin-id-mock' ? 5 : 1,
      active: 1,
    })),
  },
}));

// --- 2. MOCKS DE NEGOCIO (Config, Subs, Products) ---

vi.mock('../repositories/config.repository', () => ({
  configRepository: {
    getSetting: vi.fn(async (key: string) => {
      if (key === 'min_global_affiliate_commission') return '10';
      if (key === 'platform_currency') return 'ARS';
      return null;
    }),
    getConfigsByCurrency: vi.fn(async () => ({
      fee_percent: '0.099',
      price_threshold: '1000',
      fixed_fee_low: '50',
      fixed_fee_high: '100',
    })),
  },
}));

vi.mock('../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    getActiveSubscription: vi.fn(async () => ({
      plan_name: 'Creador Initial',
      features: { max_products: 3, storage_mb: 500 },
      allowed_types: ['ebook', 'course'],
      status: 'active',
    })),
    getUserStorageUsage: vi.fn(async () => 100 * 1024 * 1024),
  },
}));

vi.mock('../repositories/product.repository', () => ({
  productRepository: {
    createProduct: vi.fn(async (input: any) => ({
      id: 'mock-id-' + Date.now(),
      ...input,
      commissionPercent: input.commissionPercent || 10,
    })),
    getProductsByCreator: vi.fn(async () => [{ id: '1' }, { id: '2' }] as any),
    getProductById: vi.fn(async (id: string) => ({
      id,
      creator_id: 'admin-id-mock',
      title: 'Producto Mock',
      status: 'published',
    })),
  },
}));

const request = supertest(app);

describe('Products API - Validaciones de Plan y Comisiones', () => {
  let creatorCookies: string = '';
  let normalUserCookies: string = '';

  beforeEach(async () => {
    // Login Admin (Creador)
    const adminLogin = await request.post('/api/auth/login').send({
      username: 'admin',
      password: 'Admin1',
    });
    const rawAdminCookies = adminLogin.headers['set-cookie'];
    const adminCookiesArray: string[] = Array.isArray(rawAdminCookies)
      ? rawAdminCookies
      : typeof rawAdminCookies === 'string'
        ? [rawAdminCookies]
        : [];
    creatorCookies = adminCookiesArray.map(c => c.split(';')[0]).join('; ');

    // Login Normal (Usuario Nivel 1)
    const normalLogin = await request.post('/api/auth/login').send({
      username: 'testuser2',
      password: 'Password123!',
    });
    const rawNormalCookies = normalLogin.headers['set-cookie'];
    const normalCookiesArray: string[] = Array.isArray(rawNormalCookies)
      ? rawNormalCookies
      : typeof rawNormalCookies === 'string'
        ? [rawNormalCookies]
        : [];
    normalUserCookies = normalCookiesArray.map(c => c.split(';')[0]).join('; ');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('debería rechazar comisión menor al 10% (Min Global)', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Ebook Barato',
        type: 'ebook',
        prices: [{ currency: 'ARS', amount: 500 }],
        commissionPercent: 5,
        sizeBytes: 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('comisión mínima');
  });

  it('debería rechazar comisión excesiva que deje al creador en negativo', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Comisión Loca',
        type: 'ebook',
        prices: [{ currency: 'ARS', amount: 1000 }],
        commissionPercent: 95,
        sizeBytes: 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('demasiado alta');
  });

  it('debería rechazar si excede el límite de productos del plan (max 3)', async () => {
    const { productRepository } = await import('../repositories/product.repository');
    vi.mocked(productRepository.getProductsByCreator).mockResolvedValueOnce([
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ] as any);

    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Cuarto Producto',
        type: 'course',
        prices: [{ currency: 'ARS', amount: 1000 }],
        commissionPercent: 20,
        sizeBytes: 1024,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Límite de productos alcanzado');
  });

  it('debería rechazar si el usuario no tiene nivel suficiente (Level 1)', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', normalUserCookies) // Se utiliza aquí para evitar el error de "assigned but never used"
      .send({
        title: 'Intento Fallido',
        type: 'ebook',
        prices: [{ currency: 'ARS', amount: 1000 }],
        commissionPercent: 20,
      });

    expect(res.status).toBe(403);
  });

  it('debería crear producto exitosamente si cumple todas las reglas', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', creatorCookies)
      .send({
        title: 'Curso Pro',
        type: 'course',
        prices: [{ currency: 'ARS', amount: 5000 }],
        commissionPercent: 25,
        sizeBytes: 1024 * 1024,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Curso Pro');
  });
});
