import { z } from 'zod';

// Definimos el schema para un precio individual
const priceSchema = z.object({
  currency: z
    .string()
    .min(3, { message: 'El código de moneda debe tener al menos 3 caracteres (ej: ARS)' })
    .max(10),
  amount: z.number().min(0, { message: 'El precio no puede ser negativo' }),
});

export const createProductSchema = z.object({
  title: z
    .string()
    .min(3, { message: 'El título debe tener al menos 3 caracteres' })
    .max(255, { message: 'El título no puede exceder 255 caracteres' }),

  description: z.string().optional(),

  // ✅ AJUSTE: Ahora es un string simple porque los IDs son dinámicos (product_types)
  type: z.string().min(1, { message: 'El tipo de producto es obligatorio' }),

  prices: z
    .array(priceSchema)
    .min(1, { message: 'Debes asignar al menos un precio en una moneda habilitada' }),

  contentUrl: z.string().url({ message: 'Debe ser una URL válida' }).optional(),

  commissionPercent: z
    .number()
    .min(0, { message: 'La comisión no puede ser menor que 0%' })
    .max(100, { message: 'La comisión no puede superar el 100%' })
    .optional(),

  status: z.enum(['draft', 'published', 'archived']).optional(),

  // Permitimos recibir el tamaño opcionalmente (útil para la integración cloud)
  sizeBytes: z.number().nonnegative().optional(),
  
  // Validación de días de garantía (Ej: entre 0 y 90 días)
  guaranteeDays: z
    .number()
    .int()
    .min(0, { message: 'La garantía no puede ser negativa' })
    .max(90, { message: 'La garantía máxima permitida es de 90 días' })
    .optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
