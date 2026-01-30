import { z } from 'zod';

export const requestPayoutSchema = z.object({
  amount: z.number().positive({ message: 'El monto debe ser mayor a cero' }),
  currency: z.string().min(3).max(10),
  destination: z
    .string()
    .min(5, { message: 'Debes ingresar una cuenta de destino válida (CBU/CVU/Wallet)' }),
});
