import { z } from 'zod';

export const createCouponSchema = z.object({
  body: z.object({
    productId: z.string().uuid('ID de producto inválido'),
    code: z
      .string()
      .min(3, 'El código debe tener al menos 3 caracteres')
      .max(20, 'El código es demasiado largo')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Solo letras, números, guiones y guiones bajos'),
    discountPercent: z
      .number()
      .min(0.01, 'El descuento debe ser mayor a 0')
      .max(20.0, 'El descuento máximo permitido es del 20%'),
    maxUses: z.number().int().positive('Debe permitir al menos 1 uso'),
    expiresAt: z.string().datetime('Fecha de expiración inválida o formato incorrecto'),
  }),
});

export const applyCouponSchema = z.object({
  body: z.object({
    productId: z.string().uuid(),
    code: z.string().trim().min(1, 'El código es requerido'),
    currency: z.string().length(3),
  }),
});
