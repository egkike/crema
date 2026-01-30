import { z } from 'zod';

const productTypeEnum = z.union([
  z.literal('course'),
  z.literal('ebook'),
  z.literal('membership'),
  z.literal('software'),
  z.literal('podcast'),
  z.literal('audiobook'),
]);

export const createProductSchema = z.object({
  title: z
    .string()
    .min(3, { message: 'El título debe tener al menos 3 caracteres' })
    .max(255, { message: 'El título no puede exceder 255 caracteres' }),

  description: z.string().optional(),

  type: productTypeEnum,

  price: z.number().min(0, { message: 'El precio no puede ser negativo' }),

  // ✅ AÑADIDO: Validación para la moneda
  currency: z
    .string()
    .min(3, { message: 'Formato de moneda inválido (ej: ARS)' })
    .max(10)
    .optional()
    .default('ARS'),

  contentUrl: z.string().url({ message: 'Debe ser una URL válida' }).optional(),

  commissionPercent: z
    .number()
    .min(0, { message: 'La comisión no puede ser menor que 0%' })
    .max(100, { message: 'La comisión no puede superar el 100%' })
    .optional(),

  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
