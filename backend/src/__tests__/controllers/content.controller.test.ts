import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock dependencies
const mockQuery = vi.fn();
vi.mock('../../db/postgres', () => ({
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    getUserProductProgress: vi.fn(),
    issueCertificate: vi.fn(),
    getProductWithNestedContent: vi.fn(),
    toggleLessonProgress: vi.fn(),
    getMyPurchasedProductsWithProgress: vi.fn(),
    getLessonQuiz: vi.fn(),
    saveQuizAttempt: vi.fn(),
    getCertificateByCode: vi.fn(),
  },
}));

vi.mock('../../services/access.service', () => ({
  AccessService: {
    getProtectedContent: vi.fn(),
    evaluateGuaranteeStatus: vi.fn(),
    getProtectedLesson: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

import {
  getProductContent,
  updateLessonProgress,
  getMyLearningDashboard,
  submitLessonQuiz,
  verifyCertificate,
  getLessonDetail,
} from '../../controllers/content.controller';
import { productRepository } from '../../repositories/product.repository';
import { AccessService } from '../../services/access.service';

describe('content.controller.ts', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      user: { id: 'user-123', email: 'test@test.com', username: 'testuser', level: 1, active: 1 },
      params: {},
      body: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      download: vi.fn(),
    };
    next = vi.fn();
  });

  describe('getProductContent', () => {
    it('should return 401 when user not authenticated', async () => {
      req.user = undefined as any;

      await getProductContent(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it('should return structured content for courses', async () => {
      (AccessService.getProtectedContent as ReturnType<typeof vi.fn>).mockResolvedValue({
        hasStructuredContent: true,
        has_structured_content: true, // backwards compatibility
        title: 'Test Course',
        type: 'course',
      });
      (productRepository.getProductWithNestedContent as ReturnType<typeof vi.fn>).mockResolvedValue({
        title: 'Test Course',
        type: 'course',
        modules: [{ id: 1, title: 'Module 1' }],
      });
      (productRepository.getUserProductProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
        percent: 50,
      });

      req.params = { productId: 'prod-123' };

      await getProductContent(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            title: 'Test Course',
            modules: expect.any(Array),
          }),
        })
      );
    });

    it('should return external URL for remote content', async () => {
      (AccessService.getProtectedContent as ReturnType<typeof vi.fn>).mockResolvedValue({
        has_structured_content: false,
        contentUrl: 'https://example.com/file.pdf',
      });

      req.params = { productId: 'prod-123' };

      await getProductContent(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { contentUrl: 'https://example.com/file.pdf' },
        })
      );
    });

    it('should return 404 when content not available', async () => {
      (AccessService.getProtectedContent as ReturnType<typeof vi.fn>).mockResolvedValue({
        has_structured_content: false,
        contentUrl: null,
      });

      req.params = { productId: 'prod-123' };

      await getProductContent(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  describe('updateLessonProgress', () => {
    it('should return 401 when user not authenticated', async () => {
      req.user = undefined as any;

      await updateLessonProgress(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it('should update lesson progress and return success', async () => {
      (AccessService.getProtectedContent as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (productRepository.toggleLessonProgress as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (AccessService.evaluateGuaranteeStatus as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (productRepository.getUserProductProgress as ReturnType<typeof vi.fn>).mockResolvedValue({ percent: 50 });

      req.body = {
        productId: '550e8400-e29b-41d4-a716-446655440000',
        lessonId: '550e8400-e29b-41d4-a716-446655440001',
        completed: true,
      };

      await updateLessonProgress(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Lección marcada como completada',
        })
      );
    });

    it('should return 400 for invalid input', async () => {
      req.body = {
        productId: 'not-a-uuid',
        lessonId: 'lesson-456',
        completed: true,
      };

      await updateLessonProgress(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Los datos enviados son incorrectos.',
        })
      );
    });
  });

  describe('getMyLearningDashboard', () => {
    it('should return 401 when user not authenticated', async () => {
      req.user = undefined as any;

      await getMyLearningDashboard(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it('should return purchased products with progress', async () => {
      (productRepository.getMyPurchasedProductsWithProgress as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'prod-1', title: 'Course 1', progress: 75 },
        { id: 'prod-2', title: 'Course 2', progress: 30 },
      ]);

      await getMyLearningDashboard(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
        })
      );
    });
  });

  describe('submitLessonQuiz', () => {
    it('should return 401 when user not authenticated', async () => {
      req.user = undefined as any;

      await submitLessonQuiz(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it('should grade quiz and return score when passed', async () => {
      (AccessService.getProtectedContent as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (productRepository.getLessonQuiz as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 1,
        lesson_id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Test Quiz',
        passing_score: 70,
        questions: [
          { id: 1, question: 'Q1', options: ['A', 'B', 'C', 'D'], correct: 0 },
          { id: 2, question: 'Q2', options: ['A', 'B', 'C', 'D'], correct: 1 },
        ],
      });
      (productRepository.saveQuizAttempt as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (productRepository.toggleLessonProgress as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (AccessService.evaluateGuaranteeStatus as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (productRepository.getUserProductProgress as ReturnType<typeof vi.fn>).mockResolvedValue({ percent: 100 });
      (productRepository.issueCertificate as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      req.body = {
        productId: '550e8400-e29b-41d4-a716-446655440000',
        lessonId: '550e8400-e29b-41d4-a716-446655440001',
        answers: [
          { questionId: 1, selectedOption: 0 },
          { questionId: 2, selectedOption: 1 },
        ],
      };

      await submitLessonQuiz(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: '¡Felicidades! Has aprobado el examen.',
          data: expect.objectContaining({
            score: 100,
            passed: true,
            correctAnswers: 2,
            totalQuestions: 2,
          }),
        })
      );
    });

    it('should return failing score when not passed', async () => {
      (AccessService.getProtectedContent as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (productRepository.getLessonQuiz as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 1,
        lesson_id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Test Quiz',
        passing_score: 70,
        questions: [
          { id: 1, question: 'Q1', options: ['A', 'B', 'C', 'D'], correct: 0 },
          { id: 2, question: 'Q2', options: ['A', 'B', 'C', 'D'], correct: 1 },
        ],
      });
      (productRepository.saveQuizAttempt as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      req.body = {
        productId: '550e8400-e29b-41d4-a716-446655440000',
        lessonId: '550e8400-e29b-41d4-a716-446655440001',
        answers: [
          { questionId: 1, selectedOption: 1 }, // Wrong
          { questionId: 2, selectedOption: 0 }, // Wrong
        ],
      };

      await submitLessonQuiz(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'No has alcanzado el puntaje mínimo.',
          data: expect.objectContaining({
            score: 0,
            passed: false,
          }),
        })
      );
    });

    it('should return 404 when quiz not found', async () => {
      (AccessService.getProtectedContent as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (productRepository.getLessonQuiz as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      req.body = {
        productId: '550e8400-e29b-41d4-a716-446655440000',
        lessonId: '550e8400-e29b-41d4-a716-446655440001',
        answers: [],
      };

      await submitLessonQuiz(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    it('should return 400 for invalid input', async () => {
      req.body = {
        productId: 'not-a-uuid',
        lessonId: 'lesson-123',
        answers: [],
      };

      await submitLessonQuiz(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Error en los datos del examen',
        })
      );
    });
  });

  describe('verifyCertificate', () => {
    it('should return certificate when found', async () => {
      (productRepository.getCertificateByCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'cert-1',
        code: 'ABC123',
        user_name: 'John Doe',
        product_title: 'Test Course',
        issued_at: new Date(),
      });

      req.params = { code: 'ABC123' };

      await verifyCertificate(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            code: 'ABC123',
          }),
        })
      );
    });

    it('should return 404 when certificate not found', async () => {
      (productRepository.getCertificateByCode as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      req.params = { code: 'INVALID' };

      await verifyCertificate(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    it('should return 400 for invalid code type', async () => {
      req.params = { code: 123 as unknown as string };

      await verifyCertificate(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('getLessonDetail', () => {
    it('should return 401 when user not authenticated', async () => {
      req.user = undefined as any;

      await getLessonDetail(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it('should return lesson detail', async () => {
      (AccessService.getProtectedLesson as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'lesson-123',
        title: 'Lesson 1',
        content: 'Lesson content',
      });

      req.params = { lessonId: 'lesson-123' };

      await getLessonDetail(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: 'lesson-123',
          }),
        })
      );
    });

    it('should return 400 for invalid lessonId', async () => {
      req.params = { lessonId: 123 as unknown as string };

      await getLessonDetail(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('getProductContent edge cases', () => {
    it('should handle errors gracefully', async () => {
      (AccessService.getProtectedContent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      req.params = { productId: '550e8400-e29b-41d4-a716-446655440000' };

      await getProductContent(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
