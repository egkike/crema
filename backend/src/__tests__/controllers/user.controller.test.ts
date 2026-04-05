import { describe, it, expect } from 'vitest';

describe('UserController', () => {
  it('should export UserController class', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(UserController).toBeDefined();
  });

  it('should have getSession method', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(typeof UserController.prototype.getSession).toBe('function');
  });

  it('should have getUsers method', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(typeof UserController.prototype.getUsers).toBe('function');
  });

  it('should have getById method', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(typeof UserController.prototype.getById).toBe('function');
  });

  it('should have createUser method', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(typeof UserController.prototype.createUser).toBe('function');
  });

  it('should have verifyEmail method', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(typeof UserController.prototype.verifyEmail).toBe('function');
  });

  it('should have updUser method', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(typeof UserController.prototype.updUser).toBe('function');
  });

  it('should have chgPassUser method', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(typeof UserController.prototype.chgPassUser).toBe('function');
  });

  it('should have deleteUser method', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(typeof UserController.prototype.deleteUser).toBe('function');
  });

  it('should have changeMyPassword method', async () => {
    const { UserController } = await import('../../controllers/user.controller');
    expect(typeof UserController.prototype.changeMyPassword).toBe('function');
  });
});
