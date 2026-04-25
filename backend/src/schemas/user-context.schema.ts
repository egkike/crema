import { z } from 'zod';

const noteTypeSchema = z.enum(['highlight', 'bookmark', 'note']);
const uuidSchema = z.string().uuid();

// Path parameters
export const productIdSchema = z.object({
  productId: uuidSchema,
});

export const noteIdSchema = z.object({
  noteId: uuidSchema,
});

export const updateProgressSchema = z.object({
  progress: z.number().int().min(0).max(100),
});

export const saveQuestionSchema = z.object({
  question: z.string().min(1).max(1000),
});

export const createNoteSchema = z.object({
  noteText: z.string().min(1).max(5000),
  noteType: noteTypeSchema,
  position: z.number().int().optional(),
});

export const updateNoteSchema = z.object({
  noteText: z.string().min(1).max(5000),
});