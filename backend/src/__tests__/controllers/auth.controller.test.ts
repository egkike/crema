import { describe, it, expect } from 'vitest';

describe('AuthController - Happy Paths', () => {
  it('should export AuthController class', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(AuthController).toBeDefined();
  });

  it('should have register method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.register).toBe('function');
  });

  it('should have login method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.login).toBe('function');
  });

  it('should have logout method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.logout).toBe('function');
  });

  it('should have refresh method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.refresh).toBe('function');
  });

  it('should have changePasswordFirstLogin method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.changePasswordFirstLogin).toBe('function');
  });

  it('should have verifyEmail method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.verifyEmail).toBe('function');
  });

  it('should have forgotPassword method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.forgotPassword).toBe('function');
  });

  it('should have resetPassword method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.resetPassword).toBe('function');
  });

  it('should have getActivity method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.getActivity).toBe('function');
  });

  it('should have getSessions method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.getSessions).toBe('function');
  });

  it('should have revokeSession method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.revokeSession).toBe('function');
  });

  it('should have revokeOtherSessions method', async () => {
    const { AuthController } = await import('../../controllers/auth.controller');
    expect(typeof AuthController.prototype.revokeOtherSessions).toBe('function');
  });
});
