import { z } from 'zod';

export const updateProgressSchema = z.object({
  productId: z.string().uuid('ID de producto inválido'),
  lessonId: z.string().uuid('ID de lección inválido'),
  completed: z.boolean(),
});
