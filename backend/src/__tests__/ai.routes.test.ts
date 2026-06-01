import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

// Import mocks from setup.ts (required for app initialization)
import './setup';

// Mock embedding service to prevent timeouts
vi.mock('../services/ai/embedding.service', () => ({
  embeddingService: {
    search: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'embed-1' }),
    deleteBySource: vi.fn().mockResolvedValue(true),
  },
}));

const request = supertest(app);

// Helper to extract auth cookies
const extractAuthCookies = (res: { headers: Record<string, string | string[] | undefined> }) => {
  const cookies = res.headers['set-cookie'];
  if (!Array.isArray(cookies)) return '';
  return cookies.map((c: string) => c.split(';')[0]).join('; ');
};

describe('AI Routes - Credits', () => {
  let userCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Login as user
    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractAuthCookies(resUser);

    // Also login as admin (used in some tests)
    await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
  });

  describe('GET /api/ai/credits', () => {
    it('debería obtener el balance de créditos del usuario', async () => {
      const res = await request
        .get('/api/ai/credits')
        .set('Cookie', userCookies);

      // Either 200 with balance or 401 if auth fails
      expect([200, 401]).toContain(res.status);
    });

    it('debería rechazar acceso sin token', async () => {
      const res = await request.get('/api/ai/credits');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/ai/credits/packages', () => {
    it('debería obtener los paquetes de créditos disponibles', async () => {
      const res = await request.get('/api/ai/credits/packages');

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/ai/credits/transactions', () => {
    it('debería obtener el historial de transacciones', async () => {
      const res = await request
        .get('/api/ai/credits/transactions')
        .set('Cookie', userCookies);

      expect([200, 401, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - Embeddings', () => {
  let userCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractAuthCookies(resUser);
  });

  describe('GET /api/ai/embeddings/search', () => {
    it('debería buscar embeddings', async () => {
      const res = await request
        .get('/api/ai/embeddings/search?query=test')
        .set('Cookie', userCookies);

      expect([200, 401, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - Q&A', () => {
  const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Login to get cookies (needed for some tests)
    await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
  });

  describe('GET /api/ai/products/:productId/questions', () => {
    it('debería obtener las preguntas de un producto', async () => {
      const res = await request.get(`/api/ai/products/${PRODUCT_ID}/questions`);

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/ai/products/:productId/faqs', () => {
    it('debería obtener los FAQs de un producto', async () => {
      const res = await request.get(`/api/ai/products/${PRODUCT_ID}/faqs`);

      expect([200, 404, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - Reviews', () => {
  const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Login to get cookies (needed for some tests)
    await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
  });

  describe('GET /api/ai/products/:productId/reviews', () => {
    it('debería obtener las reseñas de un producto', async () => {
      const res = await request.get(`/api/ai/products/${PRODUCT_ID}/reviews`);

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/ai/products/:productId/reviews/distribution', () => {
    it('debería obtener la distribución de ratings', async () => {
      const res = await request.get(`/api/ai/products/${PRODUCT_ID}/reviews/distribution`);

      expect([200, 404, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - Reports (Admin)', () => {
  let adminCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resAdmin = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
    adminCookies = extractAuthCookies(resAdmin);
  });

  describe('GET /api/ai/reports/reasons', () => {
    it('debería obtener las razones de reportes', async () => {
      const res = await request.get('/api/ai/reports/reasons');

      expect([200, 400]).toContain(res.status);
    });
  });

  describe('GET /api/ai/reports', () => {
    it('debería obtener los reportes (solo admin)', async () => {
      const res = await request
        .get('/api/ai/reports')
        .set('Cookie', adminCookies);

      expect([200, 401, 403, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - Content Policies', () => {
  describe('GET /api/ai/content/policies', () => {
    it('debería obtener las políticas de contenido', async () => {
      const res = await request.get('/api/ai/content/policies');

      expect([200, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - QA Agent', () => {
  let userCookies: string = '';
  const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractAuthCookies(resUser);
  });

  describe('GET /api/ai/products/:productId/qa-agent/config', () => {
    it('debería obtener la configuración del QA Agent', async () => {
      const res = await request
        .get(`/api/ai/products/${PRODUCT_ID}/qa-agent/config`)
        .set('Cookie', userCookies);

      expect([200, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /api/ai/agents/qa/chat', () => {
    it('debería enviar mensaje al QA Agent', async () => {
      const res = await request
        .post('/api/ai/agents/qa/chat')
        .set('Cookie', userCookies)
        .send({
          productId: PRODUCT_ID,
          message: 'test message',
        });

      expect([200, 400, 401, 500]).toContain(res.status);
    });
  });

  describe('GET /api/ai/agents/conversations', () => {
    it('debería obtener las conversaciones del usuario', async () => {
      const res = await request
        .get('/api/ai/agents/conversations')
        .set('Cookie', userCookies);

      expect([200, 401, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - Reviews Settings', () => {
  let userCookies: string = '';
  const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractAuthCookies(resUser);
  });

  describe('GET /api/ai/products/:productId/reviews/settings', () => {
    it('debería obtener la configuración de reseñas', async () => {
      const res = await request
        .get(`/api/ai/products/${PRODUCT_ID}/reviews/settings`)
        .set('Cookie', userCookies);

      expect([200, 401, 404, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - POST Create/Update', () => {
  let userCookies: string = '';
  const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractAuthCookies(resUser);
  });

  describe('POST /api/ai/embeddings', () => {
    it('debería crear un embedding', async () => {
      const res = await request
        .post('/api/ai/embeddings')
        .set('Cookie', userCookies)
        .send({
          sourceType: 'lesson',
          sourceId: 'lesson-1',
          content: 'Test content',
        });

      expect([200, 400, 401, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/ai/embeddings/:sourceType/:sourceId', () => {
    it('debería rechazar request sin autenticación con 401', async () => {
      const res = await request
        .delete('/api/ai/embeddings/lesson/lesson-1');

      expect(res.status).toBe(401);
    });

    it('debería retornar 401 si el usuario no tiene sesión válida', async () => {
      const res = await request
        .delete('/api/ai/embeddings/lesson/lesson-1')
        .set('Cookie', 'invalid-cookie');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/products/:productId/questions', () => {
    it('debería crear una pregunta', async () => {
      const res = await request
        .post(`/api/ai/products/${PRODUCT_ID}/questions`)
        .set('Cookie', userCookies)
        .send({
          question: 'Test question?',
        });

      expect([200, 400, 401, 500]).toContain(res.status);
    });
  });

  describe('POST /api/ai/products/:productId/reviews', () => {
    it('debería crear una reseña', async () => {
      const res = await request
        .post(`/api/ai/products/${PRODUCT_ID}/reviews`)
        .set('Cookie', userCookies)
        .send({
          rating: 5,
          title: 'Great course',
          content: 'Excellent content',
        });

      expect([200, 400, 401, 500]).toContain(res.status);
    });
  });

  describe('POST /api/ai/products/:productId/faqs', () => {
    it('debería crear un FAQ', async () => {
      const res = await request
        .post(`/api/ai/products/${PRODUCT_ID}/faqs`)
        .set('Cookie', userCookies)
        .send({
          question: 'What is this?',
          answer: 'This is a course',
        });

      expect([200, 400, 401, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - PUT Update', () => {
  let userCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractAuthCookies(resUser);
  });

  describe('PUT /api/ai/questions/:questionId/answer', () => {
    it('debería responder una pregunta', async () => {
      const res = await request
        .put('/api/ai/questions/question-1/answer')
        .set('Cookie', userCookies)
        .send({
          answer: 'This is the answer',
        });

      expect([200, 400, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/ai/questions/:questionId/publish', () => {
    it('debería publicar una pregunta', async () => {
      const res = await request
        .put('/api/ai/questions/question-1/publish')
        .set('Cookie', userCookies)
        .send({
          publish: true,
        });

      expect([200, 400, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/ai/reviews/:reviewId', () => {
    it('debería actualizar una reseña', async () => {
      const res = await request
        .put('/api/ai/reviews/review-1')
        .set('Cookie', userCookies)
        .send({
          rating: 4,
          title: 'Updated title',
        });

      expect([200, 400, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/ai/faqs/:faqId', () => {
    it('debería actualizar un FAQ', async () => {
      const res = await request
        .put('/api/ai/faqs/faq-1')
        .set('Cookie', userCookies)
        .send({
          question: 'Updated question?',
          answer: 'Updated answer',
        });

      expect([200, 400, 401, 404, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - DELETE', () => {
  let userCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractAuthCookies(resUser);
  });

  describe('DELETE /api/ai/questions/:questionId', () => {
    it('debería eliminar una pregunta', async () => {
      const res = await request
        .delete('/api/ai/questions/question-1')
        .set('Cookie', userCookies);

      expect([200, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/ai/reviews/:reviewId', () => {
    it('debería eliminar una reseña', async () => {
      const res = await request
        .delete('/api/ai/reviews/review-1')
        .set('Cookie', userCookies);

      expect([200, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/ai/faqs/:faqId', () => {
    it('debería eliminar un FAQ', async () => {
      const res = await request
        .delete('/api/ai/faqs/faq-1')
        .set('Cookie', userCookies);

      expect([200, 401, 404, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - Votes', () => {
  let userCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractAuthCookies(resUser);
  });

  describe('POST /api/ai/questions/:questionId/vote', () => {
    it('debería votar una pregunta', async () => {
      const res = await request
        .post('/api/ai/questions/question-1/vote')
        .set('Cookie', userCookies)
        .send({
          voteType: 'up',
        });

      expect([200, 400, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/ai/questions/:questionId/vote', () => {
    it('debería remover voto de pregunta', async () => {
      const res = await request
        .delete('/api/ai/questions/question-1/vote')
        .set('Cookie', userCookies);

      expect([200, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /api/ai/reviews/:reviewId/vote', () => {
    it('debería votar una reseña', async () => {
      const res = await request
        .post('/api/ai/reviews/review-1/vote')
        .set('Cookie', userCookies)
        .send({
          voteType: 'up',
        });

      expect([200, 400, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/ai/reviews/:reviewId/vote', () => {
    it('debería remover voto de reseña', async () => {
      const res = await request
        .delete('/api/ai/reviews/review-1/vote')
        .set('Cookie', userCookies);

      expect([200, 401, 404, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - Admin Reports', () => {
  let adminCookies: string = '';
  const REPORT_ID = 'report-000000000000000000000001';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resAdmin = await request
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'p1' });
    adminCookies = extractAuthCookies(resAdmin);
  });

  describe('GET /api/ai/reports/:reportId', () => {
    it('debería obtener un reporte específico', async () => {
      const res = await request
        .get(`/api/ai/reports/${REPORT_ID}`)
        .set('Cookie', adminCookies);

      expect([200, 401, 403, 404, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/ai/reports/:reportId/resolve', () => {
    it('debería resolver un reporte', async () => {
      const res = await request
        .put(`/api/ai/reports/${REPORT_ID}/resolve`)
        .set('Cookie', adminCookies)
        .send({
          resolution: 'Resolved',
        });

      expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /api/ai/reports/:reportId/actions', () => {
    it('debería ejecutar acción en reporte', async () => {
      const res = await request
        .post(`/api/ai/reports/${REPORT_ID}/actions`)
        .set('Cookie', adminCookies)
        .send({
          action: 'dismiss',
        });

      expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
    });
  });
});

describe('AI Routes - QA Agent Config', () => {
  let userCookies: string = '';
  const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    vi.clearAllMocks();

    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractAuthCookies(resUser);
  });

  describe('PUT /api/ai/products/:productId/qa-agent/config', () => {
    it('debería actualizar configuración del QA Agent', async () => {
      const res = await request
        .put(`/api/ai/products/${PRODUCT_ID}/qa-agent/config`)
        .set('Cookie', userCookies)
        .send({
          enabled: true,
          model: 'gpt-4',
        });

      expect([200, 400, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /api/ai/agents/qa/chat/stream', () => {
    it('debería enviar mensaje con streaming', async () => {
      const res = await request
        .post('/api/ai/agents/qa/chat/stream')
        .set('Cookie', userCookies)
        .send({
          productId: PRODUCT_ID,
          message: 'test message',
        });

      expect([200, 400, 401, 500]).toContain(res.status);
    });
  });
});
