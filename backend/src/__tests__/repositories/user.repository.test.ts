import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB pool
const createMockQuery = () => vi.fn();
let mockQuery = createMockQuery();

vi.mock('../../db/postgres', () => ({
  default: { query: (...args: any[]) => mockQuery(...args) },
}));

vi.mock('../../config/index', () => ({
  config: { db: { schema: 'public' }, allowedSchemas: ['public', 'crema'], passwordPepper: 'test-pepper' },
}));

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-password') },
}));

describe('userRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = createMockQuery();
  });

  describe('findByCredentials', () => {
    it('should return user when found by username', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-1', username: 'test', password: 'hash' }] });

      const result = await userRepository.findByCredentials('testuser');

      expect(result).not.toBeNull();
      expect(result!.username).toBe('test');
    });

    it('should return user when found by email', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-1', email: 'test@test.com' }] });

      const result = await userRepository.findByCredentials('test@test.com');

      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await userRepository.findByCredentials('not-found');

      expect(result).toBeNull();
    });
  });

  describe('getById', () => {
    it('should return user by ID', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-1', email: 'test@test.com' }] });

      const result = await userRepository.getById('user-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('user-1');
    });

    it('should return null when not found', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await userRepository.getById('not-found');

      expect(result).toBeNull();
    });
  });

  describe('getUsers', () => {
    it('should return all users', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-1' }, { id: 'user-2' }] });

      const result = await userRepository.getUsers();

      expect(result).toHaveLength(2);
    });
  });

  describe('createUser', () => {
    it('should create user with provided username', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-new', username: 'custom' }] });

      const result = await userRepository.createUser({
        email: 'test@test.com',
        fullname: 'Test User',
        username: 'custom',
      });

      expect(result).not.toBeNull();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should generate username from email when not provided', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-new' }] });

      await userRepository.createUser({
        email: 'longemail@test.com',
        fullname: 'Test User',
      });

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should generate verification token for inactive users', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-new' }] });

      const result = await userRepository.createUser({
        email: 'test@test.com',
        fullname: 'Test User',
        active: 0,
      });

      expect(result.verificationToken).not.toBeNull();
    });

    it('should not generate token for active users', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-new' }] });

      const result = await userRepository.createUser({
        email: 'test@test.com',
        fullname: 'Test User',
        active: 1,
      });

      expect(result.verificationToken).toBeNull();
    });
  });

  describe('verifyAccount', () => {
    it('should return true for valid token', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-1' }] });

      const result = await userRepository.verifyAccount('valid-token');

      expect(result).toBe(true);
    });

    it('should return false for invalid token', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await userRepository.verifyAccount('invalid-token');

      expect(result).toBe(false);
    });
  });

  describe('updUser', () => {
    it('should update and return user', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-1', fullname: 'New Name' }] });

      const result = await userRepository.updUser({
        id: 'user-1',
        input: { fullname: 'New Name' },
      });

      expect(result).not.toBeNull();
    });

    it('should handle empty input', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-1' }] });

      const result = await userRepository.updUser({ id: 'user-1', input: {} });

      expect(result).not.toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('should return true when user deleted', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await userRepository.deleteUser('user-1');

      expect(result).toBe(true);
    });

    it('should return false when user not found', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await userRepository.deleteUser('not-found');

      expect(result).toBe(false);
    });
  });

  describe('findByAffiliateSlug', () => {
    it('should find user by slug', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-1', username: 'test', affiliate_slug: 'test' }] });

      const result = await userRepository.findByAffiliateSlug('test');

      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await userRepository.findByAffiliateSlug('not-found');

      expect(result).toBeNull();
    });
  });

  describe('refresh token methods', () => {
    it('saveRefreshToken should insert token', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await userRepository.saveRefreshToken('user-1', 'hash', new Date('2025-01-01'));

      expect(mockQuery).toHaveBeenCalled();
    });

    it('findRefreshToken should find valid token', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'token-1', user_id: 'user-1' }] });

      const result = await userRepository.findRefreshToken('hash');

      expect(result).not.toBeNull();
    });

    it('findRefreshToken should return null when not found', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await userRepository.findRefreshToken('not-found');

      expect(result).toBeNull();
    });

    it('getUserSessions should return active sessions', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'sess-1' }, { id: 'sess-2' }] });

      const result = await userRepository.getUserSessions('user-1');

      expect(result).toHaveLength(2);
    });
  });

  describe('password methods', () => {
    it('chgPassUser should update password', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await userRepository.chgPassUser({ id: 'user-1', input: { password: 'newpass' } });

      expect(mockQuery).toHaveBeenCalled();
    });

    it('resetPasswordByToken should update password', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'user-1' }] });

      const result = await userRepository.resetPasswordByToken('token', 'hash');

      expect(result).toBe(true);
    });

    it('resetPasswordByToken should return false for invalid token', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await userRepository.resetPasswordByToken('invalid', 'hash');

      expect(result).toBe(false);
    });
  });

  describe('2FA methods', () => {
    it('update2FASecret should update secret', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await userRepository.update2FASecret('user-1', 'secret', ['code1', 'code2']);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('enable2FA should set enabled flag', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await userRepository.enable2FA('user-1');

      expect(mockQuery).toHaveBeenCalled();
    });

    it('disable2FA should clear secret', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await userRepository.disable2FA('user-1');

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('activity logs', () => {
    it('addActivityLog should insert log', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await userRepository.addActivityLog('user-1', 'login', { ip: '127.0.0.1', userAgent: 'Chrome' });

      expect(mockQuery).toHaveBeenCalled();
    });

    it('getActivityLogs should return logs', async () => {
      const { userRepository } = await import('../../repositories/user.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'log-1' }, { id: 'log-2' }] });

      const result = await userRepository.getActivityLogs('user-1', 10);

      expect(result).toHaveLength(2);
    });
  });
});
