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
    // Usamos _id para indicar a TS que la variable es ignorada
    findByCredentials: vi.fn(async (_id: string) => ({
      id: 'admin-uuid',
      username: 'admin',
      email: 'admin@test.com',
      fullname: 'Admin Test',
      level: 5,
      active: 1,
      password: 'hashed_with_pepper',
      must_change_password: 0,
    })),
    saveRefreshToken: vi.fn().mockResolvedValue({ success: true }),
    findRefreshToken: vi.fn().mockResolvedValue({ userId: 'admin-uuid' }),
    deleteSpecificRefreshToken: vi.fn().mockResolvedValue(true),
    getById: vi.fn(async () => ({
      id: 'admin-uuid',
      username: 'admin',
      level: 5,
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
    vi.mocked(userRepository.findRefreshToken).mockResolvedValue({ userId: 'admin-uuid' });

    const res = await request.post('/api/auth/refresh').set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Token renovado');
  });
});
