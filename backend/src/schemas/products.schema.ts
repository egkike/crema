import { z } from 'zod';

import { validateExternalUrlSafe } from '../utils/url-validator.util';

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

// ============================================================================
// DECLARATION LABELS - Required acceptances per product type
// ============================================================================

export const DECLARATION_LABELS = {
  course: 'Declaro que este curso es contenido original creado por mí y tengo los derechos necesarios sobre todo el material.',
  ebook: 'Declaro que poseo los derechos de este ebook y no infringe copyrights de terceros.',
  podcast: 'Declaro que tengo derechos sobre toda la música y audio de este podcast.',
  software: 'Declaro que este software es legítimo, posee la licencia correspondiente y no contiene malware.',
  membership: 'Declaro que poseo los derechos de todo el contenido incluido en esta membresía.',
  link: 'Declaro que tengo autorización del creador del contenido enlazado.',
} as const;

// ============================================================================
// ISBN VALIDATOR - Validates ISBN-10 and ISBN-13 formats
// Strips separators before validation to handle all display formats
// ============================================================================

export function validateISBN(raw: string): boolean {
  const normalized = raw
    .replace(/^ISBN(?:-1[03])?:?\s*/i, '')
    .replace(/[\s-]/g, '');

  const len = normalized.length;

  if (len === 10) {
    const sum = normalized
      .split('')
      .slice(0, 9)
      .reduce((acc, digit, i) => acc + parseInt(digit) * (10 - i), 0);
    const check = normalized[9]?.toUpperCase();
    const checksum = check === 'X' ? 10 : parseInt(check ?? '0');
    return !isNaN(checksum) && (sum + checksum) % 11 === 0;
  }

  if (len === 13) {
    if (!/^\d{13}$/.test(normalized)) return false;
    const sum = normalized
      .split('')
      .reduce((acc, digit, i) => acc + parseInt(digit) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }

  return false;
}

// ============================================================================
// STANDALONE DECLARATION SCHEMA - Independent validation (no .pick() on refined schemas)
// ============================================================================

const productDeclarationFieldsSchema = z.object({
  declarationAccepted: z.literal(true, {
    message: 'Debes aceptar la declaración de derechos para continuar.',
  }),

  isExternalLinkOnly: z.boolean().default(false),

  externalUrl: z
    .string()
    .url('URL inválida')
    .optional()
    .refine(val => !val || validateExternalUrlSafe(val), {
      message: 'La URL externa no está en el dominio permitido.',
    }),

  isbn: z
    .string()
    .regex(/^(?:ISBN(?:-1[03])?:?\s*)?[0-9X][0-9X\s-]{9,17}$/i, 'ISBN inválido. Formatos aceptados: ISBN-10, ISBN-13')
    .refine(val => !val || validateISBN(val), {
      message: 'ISBN con dígito de control inválido.',
    })
    .optional(),
})
  .refine(
    data => {
      if (data.isExternalLinkOnly && !data.externalUrl) {
        return false;
      }
      return true;
    },
    {
      message: 'Si el producto es solo enlace externo, debes proporcionar la URL.',
      path: ['externalUrl'],
    }
  );

// ============================================================================
// SCHEMA PRINCIPAL
// ============================================================================

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

    contentUrl: z.string().min(1, 'URL o ID de contenido inválido').optional(),

    affiliate_commission_percent: z
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

    // --- CAMPOS DE DECLARACIÓN DE CONTENIDO ---
    ...productDeclarationFieldsSchema.shape,
  })
  .refine(
    data => {
      if (data.isExternalLinkOnly && !data.externalUrl) {
        return false;
      }
      return true;
    },
    {
      message: 'Si el producto es solo enlace externo, debes proporcionar la URL.',
      path: ['externalUrl'],
    }
  )
  .refine(
    data => {
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
