import { z } from 'zod';

export const requestPayoutSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a cero'),
  currency: z.string().min(2).max(10),
  destination_account: z.string().min(10, 'CBU/CVU inválido'),
  bank_name: z.string().optional(),
  account_holder: z.string().min(3, 'Nombre de titular requerido'),
  tax_id: z.string().min(7, 'CUIT/CUIL requerido'),
  alias: z.string().optional(),
});
