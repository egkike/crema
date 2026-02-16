import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../index';

// --- 1. MOCKS DE INFRAESTRUCTURA (Auth & DB) ---

vi.mock('bcrypt', () => ({
  default: { compare: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../repositories/user.repository', () => ({
  userRepository: {
    findByCredentials: vi.fn(async (username: string) => ({
      id: username === 'admin' ? 'admin-id' : 'user-id',
      username,
      email: `${username}@test.com`,
      level: username === 'admin' ? 99 : 1, // Admin 99 para pasar el checkAccess
      active: 1,
      password: 'p1',
    })),
    getById: vi.fn(async (id: string) => ({
      id,
      username: id === 'admin-id' ? 'admin' : 'testuser',
      level: id === 'admin-id' ? 99 : 1,
      active: 1,
    })),
    saveRefreshToken: vi.fn().mockResolvedValue(true),
  },
}));

// --- 2. MOCKS DE CONTENIDO (Orders & Products) ---

vi.mock('../repositories/order.repository', () => ({
  orderRepository: {
    checkAccess: vi.fn(async (userId: string, productId: string) => {
      // Simulamos que el usuario solo tiene comprada la "id-comprada"
      return productId === 'id-comprada';
    }),
  },
}));

vi.mock('../repositories/product.repository', () => ({
  productRepository: {
    getProductById: vi.fn(async (id: string) => {
      if (id === 'id-inexistente') return null;

      return {
        id,
        creator_id: 'creator-id',
        title: 'Producto de Prueba',
        status: id === 'id-archivado' ? 'archived' : 'published',
        content_url: 'https://cdn.test.com/file.zip',
        type: 'ebook',
        updated_at: new Date(),
      };
    }),
  },
}));

const request = supertest(app);

describe('Content Access API', () => {
  let adminCookies: string[] = [];
  let userCookies: string[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();

    // LOGIN ADMIN
    const resAdmin = await request
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'p1' });

    const rawAdmin = resAdmin.headers['set-cookie'];
    // Normalización: Aseguramos que siempre sea un string[]
    adminCookies = Array.isArray(rawAdmin) ? rawAdmin : rawAdmin ? [rawAdmin as string] : [];

    // LOGIN USER
    const resUser = await request
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'p1' });

    const rawUser = resUser.headers['set-cookie'];
    // Normalización: Aseguramos que siempre sea un string[]
    userCookies = Array.isArray(rawUser) ? rawUser : rawUser ? [rawUser as string] : [];
  });

  it('debería permitir acceso si el usuario es el dueño (creador)', async () => {
    // Mockeamos para que el producto pertenezca al 'user-id'
    const { productRepository } = await import('../repositories/product.repository');
    vi.mocked(productRepository.getProductById).mockResolvedValueOnce({
      id: 'id-propia',
      creator_id: 'user-id',
      title: 'Mi Propio Curso',
      status: 'published',
      content_url: 'https://cdn.test.com/pro.zip',
    } as any);

    const res = await request.get('/api/products/id-propia/content').set('Cookie', userCookies);

    expect(res.status).toBe(200);
    expect(res.body.data.contentUrl).toBeDefined();
  });

  it('debería permitir acceso total si el usuario es Admin (Level 99)', async () => {
    const res = await request.get('/api/products/cualquier-id/content').set('Cookie', adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('debería denegar acceso si el producto está archivado (410)', async () => {
    // Primero el middleware debe dejar pasar (lo hacemos Admin)
    const res = await request.get('/api/products/id-archivado/content').set('Cookie', adminCookies);

    expect(res.status).toBe(410);
    expect(res.body.error).toContain('retirado permanentemente');
  });

  it('debería retornar 404 si el producto no existe', async () => {
    const res = await request
      .get('/api/products/id-inexistente/content')
      .set('Cookie', adminCookies);

    expect(res.status).toBe(404);
  });

  it('debería conceder acceso exitoso con compra válida', async () => {
    const res = await request.get('/api/products/id-comprada/content').set('Cookie', userCookies);

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Producto de Prueba');
    expect(res.body.data.contentUrl).toBe('https://cdn.test.com/file.zip');
  });
});
