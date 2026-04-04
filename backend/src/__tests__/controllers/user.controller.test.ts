import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../repositories/user.repository', () => ({
  userRepository: { getUsers: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../errors/AppError', () => ({
  AppError: class extends Error {
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

describe('UserController', () => {
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  });

  describe('getSession', () => {
    it('should return user session', async () => {
      const { UserController } = await import('../../controllers/user.controller');
      const mockReq = { user: { id: 'user-1', email: 'test@test.com' } };
      
      UserController.prototype.getSession(mockReq, mockRes, vi.fn());
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, user: expect.any(Object) })
      );
    });
  });

  describe('getUsers', () => {
    it('should return users list', async () => {
      const { UserController } = await import('../../controllers/user.controller');
      const mockReq = {};
      
      await UserController.prototype.getUsers(mockReq, mockRes, vi.fn());
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});
