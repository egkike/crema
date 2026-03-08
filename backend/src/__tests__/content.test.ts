import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

import { productRepositoryMock, AccessServiceMock, extractCookies, USER_ID } from './setup';

const request = supertest(app);

// UUIDs en formato Estándar (Zod es extremadamente estricto con el formato v4)
const VALID_PROD_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_LESSON_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('Content Access & Learning API', () => {
  let userCookies: string = '';
  let adminCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Logins para asegurar cookies válidas
    const resAdmin = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
    adminCookies = extractCookies(resAdmin);

    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractCookies(resUser);
  });

  it('debería permitir acceso total a cualquier contenido si el usuario es ADMIN', async () => {
    vi.mocked(AccessServiceMock.getProtectedContent).mockResolvedValue({
      id: VALID_PROD_ID,
      title: 'Admin View',
      type: 'ebook',
      contentUrl: 'https://test.com/file.pdf',
      has_structured_content: false,
      creator_id: 'someone-else',
    } as any);

    const res = await request
      .get(`/api/learning/${VALID_PROD_ID}/content`)
      .set('Cookie', adminCookies);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('debería actualizar progreso correctamente', async () => {
    vi.mocked(AccessServiceMock.getProtectedContent).mockResolvedValue({
      id: VALID_PROD_ID,
      has_structured_content: true,
      creator_id: USER_ID,
      title: 'Course',
    } as any);

    vi.mocked(productRepositoryMock.getUserProductProgress).mockResolvedValue({
      percent: 50,
      total_lessons: 10,
      completed_lessons: 5,
    });

    const res = await request
      .post('/api/learning/progress')
      .set('Cookie', userCookies)
      .set('Accept', 'application/json')
      .send({
        productId: VALID_PROD_ID,
        lessonId: VALID_LESSON_ID,
        completed: true,
      });

    // Si esto da 400, el console.log del controller (si lo pusiste) mostrará que Zod
    // no está recibiendo el booleano 'true' correctamente.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('debería permitir verificar un certificado públicamente', async () => {
    const certCode = 'cert-uuid-valid-123';

    vi.mocked(productRepositoryMock.getCertificateByCode).mockResolvedValue({
      certificate_code: certCode,
      student_name: 'Juan Perez',
      course_name: 'Curso Expert',
      issued_at: new Date(),
    } as any);

    // Sin cookies y con la URL completa
    const res = await request.get(`/api/learning/certificate/verify/${certCode}`).set('Cookie', []);

    expect(res.status).toBe(200);
    expect(res.body.data.student_name).toBe('Juan Perez');
  });

  it('debería retornar 404 si el código de certificado no existe', async () => {
    vi.mocked(productRepositoryMock.getCertificateByCode).mockResolvedValue(null);

    const res = await request.get('/api/learning/certificate/verify/no-existe').set('Cookie', []);

    // Con el cambio en el middleware, esto debería llegar al controlador
    // y el controlador devolver el 404 que esperamos.
    expect(res.status).toBe(404);
  });
});
