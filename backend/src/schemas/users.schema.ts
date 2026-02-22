import { z } from 'zod';

const userSchema = z.object({
  id: z.string().uuid().optional(),
  // Lo hacemos opcional porque el backend lo generará automáticamente
  username: z.string().min(4).max(20).optional(),
  password: z.string().min(8, { message: 'Password debe tener al menos 8 caracteres' }),
  email: z.string().email({ message: 'Email inválido' }),
  fullname: z.string().min(4, { message: 'Fullname debe tener al menos 4 caracteres' }).max(255),
  level: z.number().int().min(0).max(99).default(1),
  active: z.number().int().min(0).max(1).default(0),
});

/**
 * Esquema para Login: Permite identificar por email o username
 */
export const loginSchema = z
  .object({
    email: z.string().email().optional(),
    username: z.string().optional(),
    password: z.string().min(1, 'La contraseña es requerida'),
  })
  .refine(data => data.email || data.username, {
    message: 'Debe proporcionar al menos el email o el nombre de usuario',
    path: ['email'],
  });

/**
 * Esquema para Registro de Socios: Requiere campos específicos y el token de captcha
 */
export const registerPartnerSchema = userSchema
  .pick({
    email: true,
    password: true,
    fullname: true,
    level: true,
  })
  .extend({
    captchaToken: z.string().min(1, 'El token de verificación es requerido'),
  });

/**
 * Esquema para solicitar recuperación (Solo email)
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
});

/**
 * Esquema para resetear contraseña (Token + Password)
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'El token es requerido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

// Tipos para exportar
export type UserInput = z.infer<typeof userSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterPartnerInput = z.infer<typeof registerPartnerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// --- FUNCIONES DE VALIDACIÓN ---

export function validateUser(input: unknown) {
  return userSchema.safeParse(input);
}

export function validateLogin(input: unknown) {
  return loginSchema.safeParse(input);
}

export function validateRegisterPartner(input: unknown) {
  return registerPartnerSchema.safeParse(input);
}

/**
 * Esquema para actualizaciones parciales
 */
export const updateUserSchema = userSchema.partial();

export function validatePartialUser(input: unknown) {
  return updateUserSchema.safeParse(input);
}

export function validatePasswordDetailed(value: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (value.length < 8) {
    errors.push('La contraseña debe tener al menos 8 caracteres');
  }
  if (!/[a-z]/.test(value)) {
    errors.push('Debe contener al menos una letra minúscula');
  }
  if (!/[A-Z]/.test(value)) {
    errors.push('Debe contener al menos una letra mayúscula');
  }
  if (!/[0-9]/.test(value)) {
    errors.push('Debe contener al menos un número');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(value)) {
    errors.push('Debe contener al menos un carácter especial (ej: !@#$%^&*)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
