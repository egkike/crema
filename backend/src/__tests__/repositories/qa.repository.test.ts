import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pool
const mockQuery = vi.fn();
const mockConnect = vi.fn();
vi.mock('../../db/postgres', () => ({
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: (...args: unknown[]) => mockConnect(...args),
  },
}));

// Mock config
vi.mock('../../config/index', () => ({
  config: {
    db: { schema: 'public' },
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

import { qaRepository } from '../../repositories/ai/qa.repository';

describe('qa.repository.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Questions
  // =========================================================================

  describe('createQuestion', () => {
    it('should create and return a question', async () => {
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

      mockQuery.mockResolvedValueOnce({ rows: [mockQuestion] });

      const result = await qaRepository.createQuestion({
        productId: 'prod-1',
        userId: 'user-1',
        question: 'What is this?',
      });

      expect(result.id).toBe('q-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        ['prod-1', 'user-1', 'What is this?']
      );
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

      mockQuery.mockResolvedValueOnce({ rows: [mockQuestion] });

      const result = await qaRepository.getQuestionById('q-1');

      expect(result?.id).toBe('q-1');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await qaRepository.getQuestionById('q-1');

      expect(result).toBeNull();
    });
  });

  describe('getQuestionsByProduct', () => {
    it('should return published questions with pagination', async () => {
      const mockQuestions = [
        {
          id: 'q-1',
          product_id: 'prod-1',
          user_id: 'user-1',
          question: 'Q1',
          answer: 'A1',
          answered_by: 'creator-1',
          answered_at: new Date(),
          is_published: true,
          is_ai_generated: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: mockQuestions });

      const result = await qaRepository.getQuestionsByProduct('prod-1', false, 20, 0);

      expect(result.questions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should include unpublished when includeUnpublished is true', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: [] });

      await qaRepository.getQuestionsByProduct('prod-1', true, 20, 0);

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('product_id = $1'),
        ['prod-1', 20, 0]
      );
    });
  });

  describe('answerQuestion', () => {
    it('should update and return question with answer', async () => {
      const mockAnswered = {
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
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockAnswered] });

      const result = await qaRepository.answerQuestion('q-1', {
        answer: 'It is a test',
        answeredBy: 'creator-1',
      });

      expect(result?.answer).toBe('It is a test');
    });

    it('should return null when question not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await qaRepository.answerQuestion('q-1', {
        answer: 'Answer',
        answeredBy: 'user-1',
      });

      expect(result).toBeNull();
    });
  });

  describe('togglePublish', () => {
    it('should update is_published and return question', async () => {
      const mockQuestion = {
        id: 'q-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        question: 'Q1',
        answer: null,
        answered_by: null,
        answered_at: null,
        is_published: true,
        is_ai_generated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockQuestion] });

      const result = await qaRepository.togglePublish('q-1', true);

      expect(result?.is_published).toBe(true);
    });
  });

  describe('deleteQuestion', () => {
    it('should return true when question deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await qaRepository.deleteQuestion('q-1');

      expect(result).toBe(true);
    });

    it('should return false when no rows affected', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await qaRepository.deleteQuestion('q-1');

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Votes
  // =========================================================================

  describe('vote', () => {
    it('should insert vote and return it', async () => {
      const mockVote = {
        id: 'vote-1',
        question_id: 'q-1',
        user_id: 'user-1',
        vote_type: 'helpful',
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockVote] });

      const result = await qaRepository.vote('q-1', 'user-1', 'helpful');

      expect(result.vote_type).toBe('helpful');
    });

    it('should upsert vote (ON CONFLICT)', async () => {
      const mockVote = {
        id: 'vote-1',
        question_id: 'q-1',
        user_id: 'user-1',
        vote_type: 'not_helpful',
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockVote] });

      await qaRepository.vote('q-1', 'user-1', 'not_helpful');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        ['q-1', 'user-1', 'not_helpful']
      );
    });
  });

  describe('removeVote', () => {
    it('should delete vote and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await qaRepository.removeVote('q-1', 'user-1');

      expect(result).toBe(true);
    });

    it('should return false when no vote to remove', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await qaRepository.removeVote('q-1', 'user-1');

      expect(result).toBe(false);
    });
  });

  describe('getUserVote', () => {
    it('should return user vote when exists', async () => {
      const mockVote = {
        id: 'vote-1',
        question_id: 'q-1',
        user_id: 'user-1',
        vote_type: 'helpful',
        created_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockVote] });

      const result = await qaRepository.getUserVote('q-1', 'user-1');

      expect(result?.vote_type).toBe('helpful');
    });

    it('should return null when no vote', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await qaRepository.getUserVote('q-1', 'user-1');

      expect(result).toBeNull();
    });
  });

  describe('getVoteCounts', () => {
    it('should return helpful and not_helpful counts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { vote_type: 'helpful', count: '5' },
          { vote_type: 'not_helpful', count: '2' },
        ],
      });

      const result = await qaRepository.getVoteCounts('q-1');

      expect(result.helpful).toBe(5);
      expect(result.not_helpful).toBe(2);
    });

    it('should return zeros when no votes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await qaRepository.getVoteCounts('q-1');

      expect(result.helpful).toBe(0);
      expect(result.not_helpful).toBe(0);
    });
  });

  // =========================================================================
  // FAQs
  // =========================================================================

  describe('createFAQ', () => {
    it('should create and return FAQ', async () => {
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

      mockQuery.mockResolvedValueOnce({ rows: [mockFAQ] });

      const result = await qaRepository.createFAQ({
        productId: 'prod-1',
        question: 'What is this?',
        answer: 'It is a test',
      });

      expect(result.id).toBe('faq-1');
    });

    it('should accept custom sortOrder', async () => {
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

      mockQuery.mockResolvedValueOnce({ rows: [mockFAQ] });

      const result = await qaRepository.createFAQ({
        productId: 'prod-1',
        question: 'Q',
        answer: 'A',
        sortOrder: 5,
      });

      expect(result.sort_order).toBe(5);
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

      mockQuery.mockResolvedValueOnce({ rows: [mockFAQ] });

      const result = await qaRepository.getFAQById('faq-1');

      expect(result?.id).toBe('faq-1');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await qaRepository.getFAQById('faq-1');

      expect(result).toBeNull();
    });
  });

  describe('getFAQsByProduct', () => {
    it('should return active FAQs sorted by sort_order', async () => {
      const mockFAQs = [
        { id: 'faq-1', sort_order: 1 },
        { id: 'faq-2', sort_order: 0 },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockFAQs });

      const result = await qaRepository.getFAQsByProduct('prod-1', false);

      expect(result).toHaveLength(2);
    });

    it('should include inactive when includeInactive is true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await qaRepository.getFAQsByProduct('prod-1', true);

      // When includeInactive is true, it uses the query WITHOUT is_active filter
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('product_id = $1'),
        ['prod-1']
      );
    });
  });

  describe('updateFAQ', () => {
    it('should update and return FAQ', async () => {
      const mockUpdated = {
        id: 'faq-1',
        product_id: 'prod-1',
        question: 'Updated Q',
        answer: 'Updated A',
        sort_order: 1,
        is_active: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockUpdated] });

      const result = await qaRepository.updateFAQ('faq-1', { question: 'Updated Q' });

      expect(result?.question).toBe('Updated Q');
    });

    it('should return current FAQ when no fields to update', async () => {
      const mockFAQ = {
        id: 'faq-1',
        product_id: 'prod-1',
        question: 'Q',
        answer: 'A',
        sort_order: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // First call to getFAQById (in the updateFAQ method when no updates)
      mockQuery.mockResolvedValueOnce({ rows: [mockFAQ] });

      const result = await qaRepository.updateFAQ('faq-1', {});

      expect(result?.question).toBe('Q');
    });

    it('should update all fields', async () => {
      const mockUpdated = {
        id: 'faq-1',
        question: 'Q2',
        answer: 'A2',
        sort_order: 2,
        is_active: false,
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockUpdated] });

      await qaRepository.updateFAQ('faq-1', {
        question: 'Q2',
        answer: 'A2',
        sortOrder: 2,
        isActive: false,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('question = $2'),
        expect.arrayContaining(['Q2', 'A2', 2, false, 'faq-1'])
      );
    });
  });

  describe('deleteFAQ', () => {
    it('should return true when FAQ deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await qaRepository.deleteFAQ('faq-1');

      expect(result).toBe(true);
    });

    it('should return false when no rows affected', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await qaRepository.deleteFAQ('faq-1');

      expect(result).toBe(false);
    });
  });

  describe('reorderFAQs', () => {
    it('should reorder FAQs in a transaction', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({}) // UPDATE 1
          .mockResolvedValueOnce({}) // UPDATE 2
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };

      mockConnect.mockResolvedValue(mockClient);

      await qaRepository.reorderFAQs('prod-1', ['faq-1', 'faq-2']);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE'), [0, 'faq-1', 'prod-1']);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockRejectedValueOnce(new Error('DB error')), // UPDATE fails
        release: vi.fn(),
      };

      mockConnect.mockResolvedValue(mockClient);

      await expect(qaRepository.reorderFAQs('prod-1', ['faq-1']))
        .rejects.toThrow('DB error');

      // Verify the UPDATE was called (it throws after the first UPDATE fails)
      expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE'), [0, 'faq-1', 'prod-1']);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});