import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

// IMPORTANTE: Importamos el mock desde el setup
import { userRepositoryMock as userRepository, extractCookies } from './setup';

const request = supertest(app);

describe('Autenticación y Sesión', () => {
  let cookies: string = '';

  beforeEach(async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'admin@test.com',
      password: 'p1',
    });
    cookies = extractCookies(res);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('debería obtener datos de sesión con token válido', async () => {
    const res = await request.get('/api/auth/sessions').set('Cookie', cookies);

    if (res.status === 500) {
      console.info('Detalle del 500 en Sesiones:', res.body);
    }

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Según tu controlador, puede ser .data o .sessions
    const data = res.body.data || res.body.sessions || res.body.user;
    expect(data).toBeDefined();
  });

  it('debería rechazar acceso sin token (401)', async () => {
    const res = await request.get('/api/auth/sessions'); // Usamos ruta válida
    expect(res.status).toBe(401);
  });

  it('debería refrescar tokens correctamente', async () => {
    // Ahora vi.mocked no fallará porque userRepository viene del setup
    vi.mocked(userRepository.findRefreshToken).mockResolvedValueOnce({
      id: 'token-uuid',
      user_id: 'admin-uuid',
      token_hash: 'hash',
      revoked: false,
      expires_at: new Date(Date.now() + 999999),
    } as any);

    const res = await request.post('/api/auth/refresh').set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
