import { describe, it, expect } from 'vitest';

describe('AuthController', () => {
  it('should export AuthController class', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(AuthController).toBeDefined();
  });

  it('should have login method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.login).toBe('function');
  });

  it('should have logout method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.logout).toBe('function');
  });

  it('should have register method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.register).toBe('function');
  });

  it('should have verifyEmail method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.verifyEmail).toBe('function');
  });

  it('should have forgotPassword method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.forgotPassword).toBe('function');
  });
});
