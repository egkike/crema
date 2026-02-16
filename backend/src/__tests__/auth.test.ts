import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../index';
import { userRepository } from '../repositories/user.repository';

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../repositories/user.repository', () => ({
  userRepository: {
    findByCredentials: vi.fn(async (_id: string) => ({
      id: 'admin-uuid',
      username: 'admin',
      email: 'admin@test.com',
      fullname: 'Admin Test',
      level: 10,
      active: 1, // <--- Debe ser 1 para pasar el check del controlador
      password: 'hashed_with_pepper',
      must_change_password: false,
    })),
    saveRefreshToken: vi.fn().mockResolvedValue(true),
    // El controlador busca en la DB por el token mismo
    findRefreshToken: vi.fn().mockResolvedValue({
      user_id: 'admin-uuid',
      expires_at: new Date(Date.now() + 100000),
    }),
    deleteSpecificRefreshToken: vi.fn().mockResolvedValue(true),
    getById: vi.fn(async () => ({
      id: 'admin-uuid',
      username: 'admin',
      level: 10,
      active: 1,
    })),
  },
}));

const request = supertest(app);

describe('Autenticación y Sesión', () => {
  let cookies: string[] = [];

  beforeEach(async () => {
    const res = await request.post('/api/auth/login').send({ username: 'admin', password: 'p1' });
    const rawCookies = res.headers['set-cookie'];

    if (Array.isArray(rawCookies)) {
      cookies = rawCookies;
    } else if (typeof rawCookies === 'string') {
      cookies = [rawCookies];
    } else {
      cookies = [];
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('debería obtener datos de sesión con token válido', async () => {
    const res = await request.get('/api/session').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('debería rechazar acceso sin token (401)', async () => {
    const res = await request.get('/api/session');
    expect(res.status).toBe(401);
  });

  it('debería refrescar tokens correctamente', async () => {
    // 1. Forzamos que el mock devuelva datos válidos y con expiración futura
    vi.mocked(userRepository.findRefreshToken).mockResolvedValue({
      user_id: 'admin-uuid',
      expires_at: new Date(Date.now() + 999999).toISOString(),
    });

    // 2. Enviamos las cookies obtenidas en el beforeEach
    const res = await request.post('/api/auth/refresh').set('Cookie', cookies); // 'cookies' ya trae access_token y refresh_token del login

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Token renovado');
  });
});
