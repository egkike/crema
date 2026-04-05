import { describe, it, expect, vi } from 'vitest';

import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  cleanPayload,
} from '../../utils/jwt.util';

vi.mock('../config/index', () => ({
  config: {
    jwt: {
      secret: 'test-secret',
      refreshSecret: 'test-refresh-secret',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
    },
  },
}));

vi.mock('../utils/logger', () => ({
  default: {
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('jwt.util', () => {
  describe('generateAccessToken', () => {
    it('should generate a valid access token', () => {
      const payload = { id: 'user-1', username: 'testuser' };
      const token = generateAccessToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT format: header.payload.signature
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const payload = { id: 'user-1', username: 'testuser' };
      const token = generateRefreshToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });
  });

  describe('verifyToken', () => {
    it('should verify and return valid token payload', () => {
      const payload = { id: 'user-1', username: 'testuser' };
      const token = generateAccessToken(payload);
      const decoded = verifyToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe('user-1');
      expect(decoded?.username).toBe('testuser');
    });

    it('should return null for invalid token', () => {
      const result = verifyToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for tampered token', () => {
      const payload = { id: 'user-1', username: 'testuser' };
      const token = generateAccessToken(payload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      const result = verifyToken(tamperedToken);
      expect(result).toBeNull();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify and return valid refresh token payload', () => {
      const payload = { id: 'user-1', username: 'testuser' };
      const token = generateRefreshToken(payload);
      const decoded = verifyRefreshToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe('user-1');
    });

    it('should return null for invalid refresh token', () => {
      const result = verifyRefreshToken('invalid-token');
      expect(result).toBeNull();
    });
  });

  describe('cleanPayload', () => {
    it('should remove iat and exp from payload', () => {
      const payload = {
        id: 'user-1',
        username: 'testuser',
        iat: 1234567890,
        exp: 1234567890,
      };
      const cleaned = cleanPayload(payload);
      expect(cleaned.iat).toBeUndefined();
      expect(cleaned.exp).toBeUndefined();
      expect(cleaned.id).toBe('user-1');
      expect(cleaned.username).toBe('testuser');
    });

    it('should preserve other fields', () => {
      const payload = {
        id: 'user-1',
        username: 'testuser',
        email: 'test@test.com',
        fullname: 'Test User',
        level: 1,
        active: 1,
        iat: 1234567890,
        exp: 1234567890,
      };
      const cleaned = cleanPayload(payload);
      expect(cleaned.email).toBe('test@test.com');
      expect(cleaned.fullname).toBe('Test User');
      expect(cleaned.level).toBe(1);
      expect(cleaned.active).toBe(1);
    });
  });
});
