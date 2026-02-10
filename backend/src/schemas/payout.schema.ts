import { z } from 'zod';

export const requestPayoutSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a cero'),
  currency: z.string().min(2).max(10),
  payoutMethodId: z.string().uuid('ID de método de retiro inválido'),
});