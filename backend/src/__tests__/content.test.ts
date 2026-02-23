import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

// Importamos los mocks globales del setup
import { productRepositoryMock, extractCookies } from './setup';

// --- MOCKS ESPECÍFICOS ---
// El de órdenes está bien aquí porque no suele usarse en todos lados
vi.mock('../repositories/order.repository', () => ({
  orderRepository: {
    checkAccess: vi.fn(async (userId: string, productId: string) => {
      return productId === 'id-comprada';
    }),
  },
}));

// ELIMINAMOS EL vi.mock de productRepository de aquí.
// Ya está mockeado globalmente en setup.ts y vinculado a productRepositoryMock.

const request = supertest(app);

describe('Content Access API', () => {
  let adminCookies: string = '';
  let userCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    // LOGIN ADMIN
    const resAdmin = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
    adminCookies = extractCookies(resAdmin);

    // LOGIN USER
    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractCookies(resUser);
  });

  it('debería permitir acceso si el usuario es el dueño (creador)', async () => {
    // Ahora sí, esto modificará el comportamiento del repositorio que usa el controlador
    vi.mocked(productRepositoryMock.getProductById).mockResolvedValue({
      id: 'id-propia',
      creator_id: 'user-uuid', // Coincide con el ID del login en setup.ts
      title: 'Mi Propio Curso',
      status: 'published',
      content_url: 'https://cdn.test.com/pro.zip',
    } as any);

    const res = await request.get('/api/products/id-propia/content').set('Cookie', userCookies);

    expect(res.status).toBe(200);
  });

  it('debería permitir acceso total si el usuario es Admin (Level 99)', async () => {
    vi.mocked(productRepositoryMock.getProductById).mockResolvedValue({
      id: 'cualquier-id',
      creator_id: 'otro-user',
      status: 'published',
    } as any);

    const res = await request.get('/api/products/cualquier-id/content').set('Cookie', adminCookies);

    expect(res.status).toBe(200);
  });

  it('debería denegar acceso si el producto está archivado (410)', async () => {
    vi.mocked(productRepositoryMock.getProductById).mockResolvedValue({
      id: 'id-archivado',
      status: 'archived',
    } as any);

    const res = await request.get('/api/products/id-archivado/content').set('Cookie', adminCookies);

    expect(res.status).toBe(410);
  });

  it('debería retornar 404 si el producto no existe', async () => {
    vi.mocked(productRepositoryMock.getProductById).mockResolvedValue(undefined);

    const res = await request
      .get('/api/products/id-inexistente/content')
      .set('Cookie', adminCookies);

    expect(res.status).toBe(404);
  });

  it('debería conceder acceso exitoso con compra válida', async () => {
    vi.mocked(productRepositoryMock.getProductById).mockResolvedValue({
      id: 'id-comprada',
      creator_id: 'otro-vendedor',
      status: 'published',
      content_url: 'https://cdn.test.com/file.zip',
    } as any);

    const res = await request.get('/api/products/id-comprada/content').set('Cookie', userCookies);

    expect(res.status).toBe(200);
    expect(res.body.data.contentUrl).toBe('https://cdn.test.com/file.zip');
  });
});
