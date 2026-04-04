import { describe, it, expect } from 'vitest';

import {
  loginSchema,
  registerPartnerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateUserSchema,
  validateUser,
  validateLogin,
  validateRegisterPartner,
  validatePartialUser,
  validatePasswordDetailed,
} from '../../schemas/users.schema';

describe('users.schema', () => {
  describe('loginSchema', () => {
    it('should validate correct login with email', () => {
      const result = loginSchema.safeParse({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should validate correct login with username', () => {
      const result = loginSchema.safeParse({
        username: 'testuser',
        password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should reject login without email or username', () => {
      const result = loginSchema.safeParse({
        password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should reject login without password', () => {
      const result = loginSchema.safeParse({
        email: 'test@test.com',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid email format', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('registerPartnerSchema', () => {
    it('should validate correct partner registration', () => {
      const result = registerPartnerSchema.safeParse({
        email: 'partner@test.com',
        password: 'Password1!',
        fullname: 'Partner User',
        level: 1,
        captchaToken: 'valid-token',
      });

      expect(result.success).toBe(true);
    });

    it('should reject registration without captcha token', () => {
      const result = registerPartnerSchema.safeParse({
        email: 'partner@test.com',
        password: 'Password1!',
        fullname: 'Partner User',
        level: 1,
      });

      expect(result.success).toBe(false);
    });

    it('should reject weak password', () => {
      const result = registerPartnerSchema.safeParse({
        email: 'partner@test.com',
        password: 'weak',
        fullname: 'Partner User',
        level: 1,
        captchaToken: 'valid-token',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('forgotPasswordSchema', () => {
    it('should validate correct email', () => {
      const result = forgotPasswordSchema.safeParse({
        email: 'test@test.com',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = forgotPasswordSchema.safeParse({
        email: 'invalid',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    it('should validate correct reset password', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'reset-token-123',
        password: 'Password1!',
      });

      expect(result.success).toBe(true);
    });

    it('should reject short password', () => {
      const result = resetPasswordSchema.safeParse({
        token: 'reset-token-123',
        password: 'short',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing token', () => {
      const result = resetPasswordSchema.safeParse({
        password: 'Password1!',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('updateUserSchema', () => {
    it('should allow partial updates', () => {
      const result = updateUserSchema.safeParse({
        email: 'new@test.com',
      });

      expect(result.success).toBe(true);
    });

    it('should allow empty updates', () => {
      const result = updateUserSchema.safeParse({});

      expect(result.success).toBe(true);
    });
  });

  describe('validateUser', () => {
    it('should return success for valid user', () => {
      const result = validateUser({
        username: 'testuser',
        password: 'Password1!',
        email: 'test@test.com',
        fullname: 'Test User',
      });

      expect(result.success).toBe(true);
    });

    it('should return error for invalid user', () => {
      const result = validateUser({
        email: 'not-an-email',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('validateLogin', () => {
    it('should validate login input', () => {
      const result = validateLogin({
        email: 'test@test.com',
        password: 'password',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('validateRegisterPartner', () => {
    it('should validate partner registration', () => {
      const result = validateRegisterPartner({
        email: 'partner@test.com',
        password: 'Password1!',
        fullname: 'Partner',
        captchaToken: 'token',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('validatePartialUser', () => {
    it('should validate partial user update', () => {
      const result = validatePartialUser({
        email: 'update@test.com',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('validatePasswordDetailed', () => {
    it('should validate strong password', () => {
      const result = validatePasswordDetailed('StrongP@ss1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject short password', () => {
      const result = validatePasswordDetailed('Short1!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La contraseña debe tener al menos 8 caracteres');
    });

    it('should reject password without lowercase', () => {
      const result = validatePasswordDetailed('PASSWORD1!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Debe contener al menos una letra minúscula');
    });

    it('should reject password without uppercase', () => {
      const result = validatePasswordDetailed('password1!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Debe contener al menos una letra mayúscula');
    });

    it('should reject password without number', () => {
      const result = validatePasswordDetailed('Password!');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Debe contener al menos un número');
    });

    it('should reject password without special character', () => {
      const result = validatePasswordDetailed('Password1');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Debe contener al menos un carácter especial (ej: !@#$%^&*)');
    });

    it('should return multiple errors for weak password', () => {
      const result = validatePasswordDetailed('weak');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
