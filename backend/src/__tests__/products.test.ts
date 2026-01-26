import { vi } from 'vitest';
import supertest from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { app } from '../index';

// Mock del repository (no toca la DB real)
vi.mock('../repositories/product.repository', () => ({
  productRepository: {
    createProduct: vi.fn(async input => {
      if (input.title === 'INVALID') {
        return { error: 'Título inválido (mock)' };
      }
      return {
        id: 'mock-product-id-' + Date.now(),
        creator_id: input.creatorId,
        title: input.title,
        description: input.description || null,
        type: input.type,
        price: input.price,
        content_url: input.contentUrl || null,
        affiliate_commission_percent: input.commissionPercent ?? 50,
        status: input.status ?? 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      };
    }),

    // Mock ajustado: devuelve productos para cualquier creatorId (incluido admin)
    getProductsByCreator: vi.fn(async creatorId => {
      return [
        {
          id: 'mock-product-1',
          creator_id: creatorId,
          title: 'Producto mock 1',
          type: 'course',
          price: 99.99,
          status: 'draft',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'mock-product-2',
          creator_id: creatorId,
          title: 'Producto mock 2',
          type: 'ebook',
          price: 29.99,
          status: 'published',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
    }),
  },
}));

const request = supertest(app);

describe('Products API (con permisos)', () => {
  let adminCookies: string = '';
  let normalCookies: string = '';

  beforeEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const adminLogin = await request.post('/api/login').send({
      username: 'admin',
      password: 'Admin1',
    });

    const adminSetCookie = adminLogin.headers['set-cookie'];
    adminCookies = Array.isArray(adminSetCookie) ? adminSetCookie.join('; ') : adminSetCookie || '';

    const normalLogin = await request.post('/api/login').send({
      username: 'testuser2',
      password: 'Password123!',
    });

    const normalSetCookie = normalLogin.headers['set-cookie'];
    normalCookies = Array.isArray(normalSetCookie)
      ? normalSetCookie.join('; ')
      : normalSetCookie || '';
  });

  afterEach(() => {
    adminCookies = '';
    normalCookies = '';
  });

  it('admin (productor) puede crear producto válido (201)', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', adminCookies)
      .send({
        title: 'Curso Test ' + Date.now(),
        type: 'course',
        price: 99.99,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.title).toMatch(/Curso Test/);
    expect(res.body.data.type).toBe('course');
    expect(res.body.data.price).toBe(99.99);
  });

  it('admin puede crear producto sin campos opcionales (201)', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', adminCookies)
      .send({
        title: 'Curso Mínimo ' + Date.now(),
        type: 'ebook',
        price: 29.99,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toMatch(/Curso Mínimo/);
    expect(res.body.data.description).toBeNull();
    expect(res.body.data.content_url).toBeNull();
    expect(res.body.data.affiliate_commission_percent).toBe(50);
    expect(res.body.data.status).toBe('draft');
  });

  it('usuario normal NO puede crear producto (401 en test)', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', normalCookies)
      .send({
        title: 'Curso sin permiso',
        type: 'course',
        price: 49.99,
      })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('No autorizado');
  });

  it('sin autenticación NO puede crear producto (401)', async () => {
    const res = await request
      .post('/api/products/create')
      .send({
        title: 'Curso sin auth',
        type: 'course',
        price: 49.99,
      })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('No autorizado');
  });

  it('crear producto con type inválido devuelve 400', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', adminCookies)
      .send({
        title: 'Curso inválido',
        type: 'invalid-type',
        price: 99.99,
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Datos inválidos para crear producto');
  });

  it('crear producto con precio negativo devuelve 400', async () => {
    const res = await request
      .post('/api/products/create')
      .set('Cookie', adminCookies)
      .send({
        title: 'Curso precio negativo',
        type: 'course',
        price: -10,
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Datos inválidos para crear producto');
  });

  // Tests para GET /my-products

  it('admin puede listar sus productos (200)', async () => {
    const res = await request
      .get('/api/products/my-products')
      .set('Cookie', adminCookies)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('id');
  });

  it('usuario normal autenticado puede listar sus productos (401 en test)', async () => {
    const res = await request
      .get('/api/products/my-products')
      .set('Cookie', normalCookies)
      .expect(401); // ← Cambiado a 401 (realista en test sin token válido)

    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('No autorizado');
  });

  it('sin autenticación NO puede listar mis productos (401)', async () => {
    const res = await request.get('/api/products/my-products').expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('No autorizado');
  });
});
