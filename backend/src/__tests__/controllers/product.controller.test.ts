import { describe, it, expect } from 'vitest';

describe('ProductController', () => {
  it('should export controller functions', async () => {
    const controller = await import('../../controllers/product.controller');
    expect(controller.createProduct).toBeDefined();
    expect(controller.getMyProducts).toBeDefined();
    expect(controller.deleteProduct).toBeDefined();
  });
});

describe('AuthController', () => {
  it('should export controller class', async () => {
    const controller = await import('../../controllers/auth.controller');
    expect(controller.AuthController).toBeDefined();
  });
});
