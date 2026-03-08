import { vi, describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';

import { app } from '../app';

import { productRepositoryMock, AccessServiceMock, extractCookies } from './setup';

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

  it('debería aprobar el examen si se alcanza el puntaje mínimo', async () => {
    vi.mocked(AccessServiceMock.getProtectedContent).mockResolvedValue({
      id: VALID_PROD_ID,
      has_structured_content: true,
      creator_id: 'other',
    } as any);

    // USAMOS "as any" AQUÍ PARA EVITAR EL ERROR DE SOBRECARGA
    vi.mocked(productRepositoryMock.getLessonQuiz).mockResolvedValue({
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

    expect(res.status).toBe(200);
    expect(res.body.data.passed).toBe(true);
  });

  it('debería reprobar si el puntaje es menor al passing_score', async () => {
    vi.mocked(AccessServiceMock.getProtectedContent).mockResolvedValue({
      id: VALID_PROD_ID,
    } as any);
    vi.mocked(productRepositoryMock.getLessonQuiz).mockResolvedValue({
      id: 'q-1',
      passing_score: 70,
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
          { questionId: 1, selectedOption: 0 }, // Correcta
          { questionId: 2, selectedOption: 9 }, // Incorrecta (50%)
        ],
      });

    expect(res.body.data.passed).toBe(false);
    expect(res.body.data.score).toBe(50);
    expect(productRepositoryMock.toggleLessonProgress).not.toHaveBeenCalled();
  });
});
