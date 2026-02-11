import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../index';

vi.mock('bcrypt', () => ({
  default: { compare: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../repositories/user.repository', () => ({
  userRepository: {
    findByCredentials: vi.fn(async (identifier: string) => ({
      id: identifier === 'admin' ? 'admin-id' : 'user-id',
      username: identifier,
      email: `${identifier}@test.com`,
      level: identifier === 'admin' ? 5 : 1,
      active: 1,
      password: 'p1',
      must_change_password: 0,
    })),
    saveRefreshToken: vi.fn().mockResolvedValue({ success: true }),
    getById: vi.fn(async (requestedId: string) => ({
      id: requestedId,
      username: 'mockuser',
      level: requestedId === 'admin-id' ? 5 : 1,
      active: 1,
    })),
    getUsers: vi.fn(async () => [
      { id: '1', username: 'user1', email: 'u1@t.com', level: 1, active: 1 },
    ]),
  },
}));

vi.mock('../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    getActiveSubscription: vi.fn(async (_userId: string) => ({
      plan_name: 'Creador Initial',
      status: 'active',
      features: { max_products: 3, storage_mb: 500 },
      current_period_end: new Date().toISOString(),
      allowed_types: ['ebook'],
    })),
    getUserStorageUsage: vi.fn(async (_userId: string) => 1048576),
  },
}));

vi.mock('../repositories/product.repository', () => ({
  productRepository: {
    getProductsByCreator: vi.fn(async (_userId: string) => [{}, {}]),
  },
}));

const request = supertest(app);

describe('Users API', () => {
  let adminCookies: string[] = [];
  let userCookies: string[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();

    const resAdmin = await request
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'p1' });
    const rawAdmin = resAdmin.headers['set-cookie'];
    adminCookies = Array.isArray(rawAdmin)
      ? rawAdmin
      : typeof rawAdmin === 'string'
        ? [rawAdmin]
        : [];

    const resUser = await request
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'p1' });
    const rawUser = resUser.headers['set-cookie'];
    userCookies = Array.isArray(rawUser) ? rawUser : typeof rawUser === 'string' ? [rawUser] : [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('admin puede listar usuarios (200)', async () => {
    const res = await request.get('/api/users').set('Cookie', adminCookies);

    expect(res.status).toBe(200);

    // Verificamos si es un array directo o está dentro de .data o .users
    const data = Array.isArray(res.body) ? res.body : res.body.data || res.body.users;
    expect(Array.isArray(data)).toBe(true);
  });

  it('usuario normal NO puede listar usuarios (403)', async () => {
    const res = await request.get('/api/users').set('Cookie', userCookies);
    expect(res.status).toBe(403);
  });

  it('debería retornar el estado de suscripción correctamente', async () => {
    const res = await request.get('/api/subscription/status').set('Cookie', adminCookies);

    expect(res.status).toBe(200);
    // Aquí tu controlador usa res.body.data.planName según vimos
    expect(res.body.data.planName).toBe('Creador Initial');
  });
});
