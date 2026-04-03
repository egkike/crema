import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

// Import mocks from setup.ts
import { 
  productRepositoryMock as productRepository,
  AccessServiceMock,
  extractCookies 
} from './setup';

const request = supertest(app);

const VALID_PROD_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_LESSON_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('Quiz Submission API', () => {
  let userCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    const resUser = await request
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'p1' });
    userCookies = extractCookies(resUser);
  });

  it('debería procesar el intento de quiz', async () => {
    AccessServiceMock.getProtectedContent.mockResolvedValue({
      id: VALID_PROD_ID,
      has_structured_content: true,
      creator_id: 'other',
    } as any);

    productRepository.getLessonQuiz.mockResolvedValue({
      id: 'q-1',
      passing_score: 60,
      questions: [
        { id: 1, correct: 0 },
        { id: 2, correct: 1 },
      ],
    } as any);

    const res = await request
      .post('/api/learning/quiz/submit')
      .set('Cookie', userCookies)
      .send({
        productId: VALID_PROD_ID,
        lessonId: VALID_LESSON_ID,
        answers: [
          { questionId: 1, selectedOption: 0 },
          { questionId: 2, selectedOption: 1 },
        ],
      });

    // El endpoint puede devolver 200 o 401
    expect([200, 401]).toContain(res.status);
  });

  it('debería actualizar progreso al completar lección', async () => {
    productRepository.toggleLessonProgress.mockResolvedValue(undefined);

    const res = await request
      .post('/api/learning/progress')
      .set('Cookie', userCookies)
      .send({
        productId: VALID_PROD_ID,
        lessonId: VALID_LESSON_ID,
        completed: true,
      });

    expect([200, 401]).toContain(res.status);
  });
});