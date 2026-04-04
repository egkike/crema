import { describe, it, expect } from 'vitest';

describe('AuthController', () => {
  it('should export controller class', async () => {
    const controller = await import('../../controllers/auth.controller');
    expect(controller.AuthController).toBeDefined();
  });
});
