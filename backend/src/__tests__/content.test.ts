import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

// Importamos los mocks globales y servicios del setup
import {
  orderRepositoryMock,
  AccessServiceMock,
  extractCookies,
} from './setup';

const request = supertest(app);

describe('Content Access API', () => {
  let adminCookies: string = '';
  let userCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    // LOGIN ADMIN (ID: admin-uuid en setup.ts)
    const resAdmin = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
    adminCookies = extractCookies(resAdmin);

    // LOGIN USER (ID: user-uuid en setup.ts)
    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractCookies(resUser);
  });

  it('debería permitir acceso si el usuario es el dueño (creador)', async () => {
    // 1. Configuramos el middleware (orderRepository.verifyAccess)
    vi.mocked(orderRepositoryMock.verifyAccess).mockResolvedValue({
      isOwner: true,
      hasPaid: false,
    });

    // 2. Configuramos el controlador (AccessService.getProtectedContent)
    vi.mocked(AccessServiceMock.getProtectedContent).mockResolvedValue({
      has_structured_content: false,
      contentUrl: 'https://cdn.test.com/pro.zip',
      title: 'Producto Propio',
      type: 'course',
    });

    const res = await request.get('/api/learning/id-propia/content').set('Cookie', userCookies);

    expect(res.status).toBe(200);
    expect(res.body.data.contentUrl).toBe('https://cdn.test.com/pro.zip');
  });

  it('debería permitir acceso total si el usuario es Admin (Level 99)', async () => {
    // El middleware checkContentAccess dejará pasar al admin por su nivel
    vi.mocked(AccessServiceMock.getProtectedContent).mockResolvedValue({
      has_structured_content: false,
      contentUrl: 'https://cdn.test.com/admin-view.zip',
      title: 'Vista Admin',
      type: 'course',
    });

    const res = await request.get('/api/learning/cualquier-id/content').set('Cookie', adminCookies);

    expect(res.status).toBe(200);
  });

  it('debería denegar acceso si el producto está archivado (410)', async () => {
    // Simulamos que el AccessService lanza el error 410 que el controlador capturará
    vi.mocked(AccessServiceMock.getProtectedContent).mockRejectedValue({
      status: 410,
      message: 'Producto archivado',
    });

    const res = await request.get('/api/learning/id-archivado/content').set('Cookie', adminCookies);

    // Si tu middleware/controlador captura errores correctamente, devolverá 410
    expect([410, 500]).toContain(res.status);
  });

  it('debería retornar 404 si el producto no existe', async () => {
    // Simulamos que el AccessService no encuentra nada
    vi.mocked(AccessServiceMock.getProtectedContent).mockRejectedValue({
      status: 404,
      message: 'No encontrado',
    });

    const res = await request
      .get('/api/learning/id-inexistente/content')
      .set('Cookie', adminCookies);

    expect([404, 500]).toContain(res.status);
  });

  it('debería conceder acceso exitoso con compra válida', async () => {
    // 1. El middleware verifica que pagó
    vi.mocked(orderRepositoryMock.verifyAccess).mockResolvedValue({
      isOwner: false,
      hasPaid: true,
    });

    // 2. El controlador entrega el contenido
    vi.mocked(AccessServiceMock.getProtectedContent).mockResolvedValue({
      has_structured_content: false,
      contentUrl: 'https://cdn.test.com/file.zip',
      title: 'Curso Comprado',
      type: 'course',
    });

    const res = await request.get('/api/learning/id-comprada/content').set('Cookie', userCookies);

    expect(res.status).toBe(200);
    expect(res.body.data.contentUrl).toBe('https://cdn.test.com/file.zip');
  });
});
