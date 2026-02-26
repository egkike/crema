import { z } from 'zod';

// 1. Precios (Se mantiene igual)
const priceSchema = z.object({
  currency: z
    .string()
    .min(3, { message: 'El código de moneda debe tener al menos 3 caracteres (ej: ARS)' })
    .max(10),
  amount: z.number().min(0, { message: 'El precio no puede ser negativo' }),
});

// 2. Estructura de Lecciones y Módulos
const lessonSchema = z.object({
  title: z.string().min(1, 'La lección requiere un título'),
  description: z.string().optional(),
  contentType: z.enum(['video', 'pdf', 'text', 'quiz', 'link']).default('video'),
  contentUrl: z.string().min(1, 'El contenido o ID es requerido').optional(),
  bodyText: z.string().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  isPreview: z.boolean().default(false),
  orderIndex: z.number().int().default(0),
});

const moduleSchema = z.object({
  title: z.string().min(1, 'El módulo requiere un título'),
  orderIndex: z.number().int().default(0),
  lessons: z.array(lessonSchema).min(1, 'Un módulo debe tener al menos una lección'),
});

// 3. Schema Principal
export const createProductSchema = z
  .object({
    title: z
      .string()
      .min(3, { message: 'El título debe tener al menos 3 caracteres' })
      .max(255, { message: 'El título no puede exceder 255 caracteres' }),

    description: z.string().optional(),

    type: z.string().min(1, { message: 'El tipo de producto es obligatorio' }),

    prices: z
      .array(priceSchema)
      .min(1, { message: 'Debes asignar al menos un precio en una moneda habilitada' }),

    // Si no es estructurado (ej: un Ebook), este campo es el principal
    // Permitimos string simple para mayor compatibilidad
    contentUrl: z.string().min(1, 'URL o ID de contenido inválido').optional(),

    commissionPercent: z
      .number()
      .min(0, { message: 'La comisión no puede ser menor que 0%' })
      .max(100, { message: 'La comisión no puede superar el 100%' })
      .optional(),

    status: z.enum(['draft', 'published', 'archived']).optional(),
    sizeBytes: z.number().nonnegative().optional(),

    guaranteeDays: z
      .number()
      .int()
      .min(0, { message: 'La garantía no puede ser negativa' })
      .max(90, { message: 'La garantía máxima permitida es de 90 días' })
      .optional(),

    // --- CAMPOS PARA CONTENIDO ESTRUCTURADO ---
    hasStructuredContent: z.boolean().default(false),
    modules: z.array(moduleSchema).optional(),
  })
  .refine(
    data => {
      // REGLA DE ORO: Si dice que es estructurado, DEBE enviar módulos.
      if (data.hasStructuredContent && (!data.modules || data.modules.length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: 'Si el contenido es estructurado, debes incluir al menos un módulo con lecciones.',
      path: ['modules'],
    }
  )
  .refine(
    data => {
      // Si no es estructurado y no es un curso, debería tener una URL de contenido (excepto en draft)
      if (!data.hasStructuredContent && data.status === 'published' && !data.contentUrl) {
        return false;
      }
      return true;
    },
    {
      message: 'Un producto publicado debe tener una URL de contenido o estar estructurado.',
      path: ['contentUrl'],
    }
  );

export type CreateProductInput = z.infer<typeof createProductSchema>;
