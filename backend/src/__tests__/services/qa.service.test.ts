import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock productRepository
vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    getProductById: vi.fn(),
  },
}));

// Mock qaRepository
vi.mock('../../repositories/ai/qa.repository', () => ({
  qaRepository: {
    createQuestion: vi.fn(),
    getQuestionsByProduct: vi.fn(),
    getQuestionById: vi.fn(),
    answerQuestion: vi.fn(),
    togglePublish: vi.fn(),
    deleteQuestion: vi.fn(),
    vote: vi.fn(),
    getVoteCounts: vi.fn(),
    getUserVote: vi.fn(),
    removeVote: vi.fn(),
    createFAQ: vi.fn(),
    getFAQsByProduct: vi.fn(),
    getFAQById: vi.fn(),
    updateFAQ: vi.fn(),
    deleteFAQ: vi.fn(),
    reorderFAQs: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { qaService } from '../../services/ai/qa.service';
import { productRepository } from '../../repositories/product.repository';
import { qaRepository } from '../../repositories/ai/qa.repository';
import { AppError } from '../../errors/AppError';

describe('qa.service.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Questions
  // =========================================================================

  describe('createQuestion', () => {
    it('should create question when product exists', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'What is this?',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: false,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      productRepository.getProductById.mockResolvedValue(mockProduct);
      qaRepository.createQuestion.mockResolvedValue(mockQuestion);

      const result = await qaService.createQuestion('prod-1', 'user-1', 'What is this?');

      expect(result.id).toBe('q-1');
      expect(productRepository.getProductById).toHaveBeenCalledWith('prod-1');
      expect(qaRepository.createQuestion).toHaveBeenCalledWith({
        productId: 'prod-1',
        userId: 'user-1',
        question: 'What is this?',
      });
    });

    it('should throw AppError when product not found', async () => {
      productRepository.getProductById.mockResolvedValue(null);

      await expect(qaService.createQuestion('prod-1', 'user-1', 'What is this?'))
        .rejects.toThrow(AppError);
      await expect(qaService.createQuestion('prod-1', 'user-1', 'What is this?'))
        .rejects.toThrow('Producto no encontrado');
    });
  });

  describe('getQuestions', () => {
    it('should return questions when product exists', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockResult = {
        questions: [
          {
            id: 'q-1',
            product_id: 'prod-1',
            user_id: 'user-1',
            question: 'What is this?',
            answer: 'It is a test',
            answered_by: 'creator-1',
            answered_at: new Date(),
            is_published: true,
            is_ai_generated: false,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        total: 1,
      };

      productRepository.getProductById.mockResolvedValue(mockProduct);
      qaRepository.getQuestionsByProduct.mockResolvedValue(mockResult);

      const result = await qaService.getQuestions('prod-1');

      expect(result.questions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should throw AppError when product not found', async () => {
      productRepository.getProductById.mockResolvedValue(null);

      await expect(qaService.getQuestions('prod-1'))
        .rejects.toThrow(AppError);
      await expect(qaService.getQuestions('prod-1'))
        .rejects.toThrow('Producto no encontrado');
    });

    it('should pass includeUnpublished parameter', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      productRepository.getProductById.mockResolvedValue(mockProduct);
      qaRepository.getQuestionsByProduct.mockResolvedValue({ questions: [], total: 0 });

      await qaService.getQuestions('prod-1', true, 50, 10);

      expect(qaRepository.getQuestionsByProduct).toHaveBeenCalledWith('prod-1', true, 50, 10);
    });
  });

  describe('getQuestionById', () => {
    it('should return question when found', async () => {
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'What is this?',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: false,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      qaRepository.getQuestionById.mockResolvedValue(mockQuestion);

      const result = await qaService.getQuestionById('q-1');

      expect(result?.id).toBe('q-1');
    });

    it('should return null when not found', async () => {
      qaRepository.getQuestionById.mockResolvedValue(null);

      const result = await qaService.getQuestionById('q-1');

      expect(result).toBeNull();
    });
  });

  describe('answerQuestion', () => {
    it('should answer question when it exists', async () => {
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'What is this?',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: false,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockAnswered = {
        ...mockQuestion,
        answer: 'This is the answer',
        answered_by: 'creator-1',
        answered_at: new Date(),
      };

      qaRepository.getQuestionById.mockResolvedValue(mockQuestion);
      qaRepository.answerQuestion.mockResolvedValue(mockAnswered);

      const result = await qaService.answerQuestion('q-1', 'This is the answer', 'creator-1');

      expect(result.answer).toBe('This is the answer');
      expect(qaRepository.answerQuestion).toHaveBeenCalledWith('q-1', {
        answer: 'This is the answer',
        answeredBy: 'creator-1',
      });
    });

    it('should throw AppError when question not found', async () => {
      qaRepository.getQuestionById.mockResolvedValue(null);

      await expect(qaService.answerQuestion('q-1', 'Answer', 'user-1'))
        .rejects.toThrow(AppError);
      await expect(qaService.answerQuestion('q-1', 'Answer', 'user-1'))
        .rejects.toThrow('Pregunta no encontrada');
    });

    it('should throw AppError when answer fails', async () => {
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'What is this?',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: false,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      qaRepository.getQuestionById.mockResolvedValue(mockQuestion);
      qaRepository.answerQuestion.mockResolvedValue(null);

      await expect(qaService.answerQuestion('q-1', 'Answer', 'user-1'))
        .rejects.toThrow(AppError);
      await expect(qaService.answerQuestion('q-1', 'Answer', 'user-1'))
        .rejects.toThrow('Error al responder la pregunta');
    });
  });

  describe('togglePublishQuestion', () => {
    it('should toggle publish when question exists', async () => {
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'What is this?',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: false,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockPublished = { ...mockQuestion, is_published: true };

      qaRepository.getQuestionById.mockResolvedValue(mockQuestion);
      qaRepository.togglePublish.mockResolvedValue(mockPublished);

      const result = await qaService.togglePublishQuestion('q-1', true);

      expect(result.is_published).toBe(true);
    });

    it('should throw AppError when question not found', async () => {
      qaRepository.getQuestionById.mockResolvedValue(null);

      await expect(qaService.togglePublishQuestion('q-1', true))
        .rejects.toThrow(AppError);
    });

    it('should throw AppError when toggle fails', async () => {
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'What is this?',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: false,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      qaRepository.getQuestionById.mockResolvedValue(mockQuestion);
      qaRepository.togglePublish.mockResolvedValue(null);

      await expect(qaService.togglePublishQuestion('q-1', true))
        .rejects.toThrow(AppError);
    });
  });

  describe('deleteQuestion', () => {
    it('should delete question when it exists', async () => {
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'What is this?',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: false,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      qaRepository.getQuestionById.mockResolvedValue(mockQuestion);
      qaRepository.deleteQuestion.mockResolvedValue(true);

      const result = await qaService.deleteQuestion('q-1');

      expect(result).toBe(true);
    });

    it('should throw AppError when question not found', async () => {
      qaRepository.getQuestionById.mockResolvedValue(null);

      await expect(qaService.deleteQuestion('q-1'))
        .rejects.toThrow(AppError);
    });
  });

  // =========================================================================
  // Votes
  // =========================================================================

  describe('voteQuestion', () => {
    it('should vote and return counts', async () => {
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'What is this?',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: false,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockUserVote = {
        id: 'vote-1',
        question_id: 'q-1',
        user_id: 'user-1',
        vote_type: 'helpful' as const,
        created_at: new Date(),
      };

      qaRepository.getQuestionById.mockResolvedValue(mockQuestion);
      qaRepository.vote.mockResolvedValue(mockUserVote);
      qaRepository.getVoteCounts.mockResolvedValue({ helpful: 5, not_helpful: 2 });
      qaRepository.getUserVote.mockResolvedValue(mockUserVote);

      const result = await qaService.voteQuestion('q-1', 'user-1', 'helpful');

      expect(result.helpful).toBe(5);
      expect(result.not_helpful).toBe(2);
      expect(result.userVote).toBe('helpful');
    });

    it('should throw AppError when question not found', async () => {
      qaRepository.getQuestionById.mockResolvedValue(null);

      await expect(qaService.voteQuestion('q-1', 'user-1', 'helpful'))
        .rejects.toThrow(AppError);
    });

    it('should return null userVote when no vote exists', async () => {
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'What is this?',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: false,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockUserVote = {
        id: 'vote-1',
        question_id: 'q-1',
        user_id: 'user-1',
        vote_type: 'helpful' as const,
        created_at: new Date(),
      };

      qaRepository.getQuestionById.mockResolvedValue(mockQuestion);
      qaRepository.vote.mockResolvedValue(mockUserVote);
      qaRepository.getVoteCounts.mockResolvedValue({ helpful: 5, not_helpful: 2 });
      qaRepository.getUserVote.mockResolvedValue(null);

      const result = await qaService.voteQuestion('q-1', 'user-1', 'helpful');

      expect(result.userVote).toBeNull();
    });
  });

  describe('removeVote', () => {
    it('should remove vote and return counts', async () => {
      qaRepository.removeVote.mockResolvedValue(true);
      qaRepository.getVoteCounts.mockResolvedValue({ helpful: 4, not_helpful: 2 });

      const result = await qaService.removeVote('q-1', 'user-1');

      expect(result.helpful).toBe(4);
      expect(result.not_helpful).toBe(2);
      expect(result.userVote).toBeNull();
      expect(qaRepository.removeVote).toHaveBeenCalledWith('q-1', 'user-1');
    });
  });

  // =========================================================================
  // FAQs
  // =========================================================================

  describe('createFAQ', () => {
    it('should create FAQ when product exists', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockFAQ = {
        id: 'faq-1',
        product_id: 'prod-1',
        question: 'What is this?',
        answer: 'It is a test',
        sort_order: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      productRepository.getProductById.mockResolvedValue(mockProduct);
      qaRepository.createFAQ.mockResolvedValue(mockFAQ);

      const result = await qaService.createFAQ('prod-1', 'What is this?', 'It is a test');

      expect(result.id).toBe('faq-1');
    });

    it('should throw AppError when product not found', async () => {
      productRepository.getProductById.mockResolvedValue(null);

      await expect(qaService.createFAQ('prod-1', 'Q', 'A'))
        .rejects.toThrow(AppError);
    });

    it('should accept sortOrder parameter', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockFAQ = {
        id: 'faq-1',
        product_id: 'prod-1',
        question: 'Q',
        answer: 'A',
        sort_order: 5,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      productRepository.getProductById.mockResolvedValue(mockProduct);
      qaRepository.createFAQ.mockResolvedValue(mockFAQ);

      await qaService.createFAQ('prod-1', 'Q', 'A', 5);

      expect(qaRepository.createFAQ).toHaveBeenCalledWith({
        productId: 'prod-1',
        question: 'Q',
        answer: 'A',
        sortOrder: 5,
      });
    });
  });

  describe('getFAQs', () => {
    it('should return FAQs when product exists', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockFAQs = [
        {
          id: 'faq-1',
          product_id: 'prod-1',
          question: 'Q1',
          answer: 'A1',
          sort_order: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      productRepository.getProductById.mockResolvedValue(mockProduct);
      qaRepository.getFAQsByProduct.mockResolvedValue(mockFAQs);

      const result = await qaService.getFAQs('prod-1');

      expect(result).toHaveLength(1);
    });

    it('should throw AppError when product not found', async () => {
      productRepository.getProductById.mockResolvedValue(null);

      await expect(qaService.getFAQs('prod-1'))
        .rejects.toThrow(AppError);
    });

    it('should pass includeInactive parameter', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      productRepository.getProductById.mockResolvedValue(mockProduct);
      qaRepository.getFAQsByProduct.mockResolvedValue([]);

      await qaService.getFAQs('prod-1', true);

      expect(qaRepository.getFAQsByProduct).toHaveBeenCalledWith('prod-1', true);
    });
  });

  describe('getFAQById', () => {
    it('should return FAQ when found', async () => {
      const mockFAQ = {
        id: 'faq-1',
        product_id: 'prod-1',
        question: 'Q1',
        answer: 'A1',
        sort_order: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      qaRepository.getFAQById.mockResolvedValue(mockFAQ);

      const result = await qaService.getFAQById('faq-1');

      expect(result?.id).toBe('faq-1');
    });

    it('should return null when not found', async () => {
      qaRepository.getFAQById.mockResolvedValue(null);

      const result = await qaService.getFAQById('faq-1');

      expect(result).toBeNull();
    });
  });

  describe('updateFAQ', () => {
    it('should update FAQ when it exists', async () => {
      const mockFAQ = {
        id: 'faq-1',
        product_id: 'prod-1',
        question: 'Q1',
        answer: 'A1',
        sort_order: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockUpdated = { ...mockFAQ, question: 'Updated Q' };

      qaRepository.getFAQById.mockResolvedValue(mockFAQ);
      qaRepository.updateFAQ.mockResolvedValue(mockUpdated);

      const result = await qaService.updateFAQ('faq-1', { question: 'Updated Q' });

      expect(result.question).toBe('Updated Q');
    });

    it('should throw AppError when FAQ not found', async () => {
      qaRepository.getFAQById.mockResolvedValue(null);

      await expect(qaService.updateFAQ('faq-1', { question: 'Q' }))
        .rejects.toThrow(AppError);
    });

    it('should throw AppError when update fails', async () => {
      const mockFAQ = {
        id: 'faq-1',
        product_id: 'prod-1',
        question: 'Q1',
        answer: 'A1',
        sort_order: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      qaRepository.getFAQById.mockResolvedValue(mockFAQ);
      qaRepository.updateFAQ.mockResolvedValue(null);

      await expect(qaService.updateFAQ('faq-1', { question: 'Q' }))
        .rejects.toThrow(AppError);
    });

    it('should update multiple fields at once', async () => {
      const mockFAQ = {
        id: 'faq-1',
        product_id: 'prod-1',
        question: 'Q1',
        answer: 'A1',
        sort_order: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockUpdated = { ...mockFAQ, question: 'Q2', answer: 'A2', sortOrder: 1, isActive: false };

      qaRepository.getFAQById.mockResolvedValue(mockFAQ);
      qaRepository.updateFAQ.mockResolvedValue(mockUpdated);

      const result = await qaService.updateFAQ('faq-1', {
        question: 'Q2',
        answer: 'A2',
        sortOrder: 1,
        isActive: false,
      });

      expect(result.question).toBe('Q2');
      expect(result.answer).toBe('A2');
    });
  });

  describe('deleteFAQ', () => {
    it('should delete FAQ when it exists', async () => {
      const mockFAQ = {
        id: 'faq-1',
        product_id: 'prod-1',
        question: 'Q1',
        answer: 'A1',
        sort_order: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      qaRepository.getFAQById.mockResolvedValue(mockFAQ);
      qaRepository.deleteFAQ.mockResolvedValue(true);

      const result = await qaService.deleteFAQ('faq-1');

      expect(result).toBe(true);
    });

    it('should throw AppError when FAQ not found', async () => {
      qaRepository.getFAQById.mockResolvedValue(null);

      await expect(qaService.deleteFAQ('faq-1'))
        .rejects.toThrow(AppError);
    });
  });

  describe('reorderFAQs', () => {
    it('should reorder FAQs when product exists', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const faqIds = ['faq-1', 'faq-2', 'faq-3'];

      productRepository.getProductById.mockResolvedValue(mockProduct);
      qaRepository.reorderFAQs.mockResolvedValue(undefined);

      await qaService.reorderFAQs('prod-1', faqIds);

      expect(qaRepository.reorderFAQs).toHaveBeenCalledWith('prod-1', faqIds);
    });

    it('should throw AppError when product not found', async () => {
      productRepository.getProductById.mockResolvedValue(null);

      await expect(qaService.reorderFAQs('prod-1', ['faq-1']))
        .rejects.toThrow(AppError);
    });
  });
});