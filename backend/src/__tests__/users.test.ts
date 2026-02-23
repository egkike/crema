import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

import { extractCookies } from './setup';

const request = supertest(app);

describe('Users API', () => {
  let adminCookies: string = '';
  let userCookies: string = '';

  beforeEach(async () => {
    // Login Admin
    const resAdmin = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
    adminCookies = extractCookies(resAdmin);

    // Login Usuario Normal (Asegúrate de que el email NO tenga "admin")
    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'pedro@test.com', password: 'p1' });
    userCookies = extractCookies(resUser);
  });

  it('admin puede listar usuarios (200)', async () => {
    const res = await request.get('/api/users').set('Cookie', adminCookies);
    expect(res.status).toBe(200);
  });

  it('usuario normal NO puede listar usuarios (403)', async () => {
    const res = await request.get('/api/users').set('Cookie', userCookies);
    // Ahora, como pedro@test.com tiene nivel 1 y el admin es 99,
    // el middleware de tu router (probablemente isAdmin) debería dar 403.
    expect(res.status).toBe(403);
  });
});
