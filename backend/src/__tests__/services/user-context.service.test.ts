import { describe, it, expect, vi, beforeEach } from 'vitest';

import { USER_ID, PRODUCT_ID } from '../setup';

import { userContextService } from '../../services/user-context.service';
import { userNotesService } from '../../services/user-notes.service';

vi.mock('../../repositories/user-context.repository', () => ({
  userContextRepository: {
    findByUserAndProduct: vi.fn(),
    findByUser: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../../repositories/user-notes.repository', () => ({
  userNotesRepository: {
    findByUserAndProduct: vi.fn(),
    findByUser: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../errors/AppError', () => ({
  AppError: class AppError extends Error {
    constructor(message: string, _statusCode: number) {
      super(message);
      this.name = 'AppError';
    }
  },
}));

import { userContextRepository } from '../../repositories/user-context.repository';
import { userNotesRepository } from '../../repositories/user-notes.repository';

describe('UserContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getContext', () => {
    it('should return context for user and product', async () => {
      const mockContext = { id: '1', userId: USER_ID, productId: PRODUCT_ID, contextData: { progress: 50 }, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(userContextRepository.findByUserAndProduct).mockResolvedValue(mockContext);

      const result = await userContextService.getContext(USER_ID, PRODUCT_ID);

      expect(result).toEqual(mockContext);
      expect(userContextRepository.findByUserAndProduct).toHaveBeenCalledWith(USER_ID, PRODUCT_ID);
    });

    it('should return null if context not found', async () => {
      vi.mocked(userContextRepository.findByUserAndProduct).mockResolvedValue(null);

      const result = await userContextService.getContext(USER_ID, PRODUCT_ID);

      expect(result).toBeNull();
    });
  });

  describe('updateProgress', () => {
    it('should update progress with valid value', async () => {
      const mockContext = { id: '1', userId: USER_ID, productId: PRODUCT_ID, contextData: { progress: 50 }, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(userContextRepository.upsert).mockResolvedValue(mockContext);

      const result = await userContextService.updateProgress(USER_ID, PRODUCT_ID, 50);

      expect(result).toEqual(mockContext);
      expect(userContextRepository.upsert).toHaveBeenCalled();
    });

    it('should throw if progress is not a number', async () => {
      await expect(userContextService.updateProgress(USER_ID, PRODUCT_ID, NaN)).rejects.toThrow('Invalid progress');
      await expect(userContextService.updateProgress(USER_ID, PRODUCT_ID, Infinity)).rejects.toThrow('Invalid progress');
    });

    it('should throw if progress out of range', async () => {
      await expect(userContextService.updateProgress(USER_ID, PRODUCT_ID, -1)).rejects.toThrow('between 0 and 100');
      await expect(userContextService.updateProgress(USER_ID, PRODUCT_ID, 101)).rejects.toThrow('between 0 and 100');
    });
  });

  describe('saveQuestion', () => {
    it('should save question to context', async () => {
      const mockContext = { id: '1', userId: USER_ID, productId: PRODUCT_ID, contextData: { questions: ['test?'] }, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(userContextRepository.findByUserAndProduct).mockResolvedValue(null);
      vi.mocked(userContextRepository.upsert).mockResolvedValue(mockContext);

      const result = await userContextService.saveQuestion(USER_ID, PRODUCT_ID, 'test?');

      expect(result).toEqual(mockContext);
    });

    it('should throw if question is empty', async () => {
      await expect(userContextService.saveQuestion(USER_ID, PRODUCT_ID, '')).rejects.toThrow('non-empty string');
      await expect(userContextService.saveQuestion(USER_ID, PRODUCT_ID, null as unknown as string)).rejects.toThrow('non-empty string');
    });

    it('should throw if question too long', async () => {
      const longQuestion = 'a'.repeat(2001);
      await expect(userContextService.saveQuestion(USER_ID, PRODUCT_ID, longQuestion)).rejects.toThrow('less than 2000 characters');
    });
  });

  describe('getContextsByUser', () => {
    it('should return all contexts for user', async () => {
      const mockContexts = [{ id: '1', userId: USER_ID, productId: PRODUCT_ID, contextData: {}, createdAt: new Date(), updatedAt: new Date() }];
      vi.mocked(userContextRepository.findByUser).mockResolvedValue(mockContexts);

      const result = await userContextService.getContextsByUser(USER_ID);

      expect(result).toEqual(mockContexts);
    });
  });
});

describe('UserNotesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNotes', () => {
    it('should return notes for user and product', async () => {
      const mockNotes = [{ id: '1', userId: USER_ID, productId: PRODUCT_ID, noteText: 'test', noteType: 'note' as const, position: null, metadata: {}, createdAt: new Date(), updatedAt: new Date() }];
      vi.mocked(userNotesRepository.findByUserAndProduct).mockResolvedValue(mockNotes);

      const result = await userNotesService.getNotes(USER_ID, PRODUCT_ID);

      expect(result).toEqual(mockNotes);
    });
  });

  describe('createNote', () => {
    it('should create note with valid type', async () => {
      const mockNote = { id: '1', userId: USER_ID, productId: PRODUCT_ID, noteText: 'test', noteType: 'note' as const, position: null, metadata: {}, createdAt: new Date(), updatedAt: new Date() };
      vi.mocked(userNotesRepository.create).mockResolvedValue(mockNote);

      const result = await userNotesService.createNote(USER_ID, PRODUCT_ID, 'test', 'note');

      expect(result).toEqual(mockNote);
    });

    it('should throw for invalid noteType', async () => {
      await expect(userNotesService.createNote(USER_ID, PRODUCT_ID, 'test', 'invalid' as unknown as 'note')).rejects.toThrow('Invalid noteType');
    });

    it('should throw if noteText empty', async () => {
      await expect(userNotesService.createNote(USER_ID, PRODUCT_ID, '', 'note')).rejects.toThrow('must be between 1 and 5000');
    });
  });

  describe('deleteNote', () => {
    it('should delete note if owned by user', async () => {
      vi.mocked(userNotesRepository.delete).mockResolvedValue(true);

      const result = await userNotesService.deleteNote('note-id', USER_ID);

      expect(result).toBe(true);
    });

    it('should return false if not owned', async () => {
      vi.mocked(userNotesRepository.delete).mockResolvedValue(false);

      const result = await userNotesService.deleteNote('note-id', USER_ID);

      expect(result).toBe(false);
    });
  });
});