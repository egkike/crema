import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios - only once at top level
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock('../../config', () => ({
  config: {
    nodeEnv: 'production',
    recaptchaSecretKey: 'test_secret_key',
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CaptchaService', () => {
  let mockPost: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const axios = await import('axios');
    mockPost = axios.default.post;
  });

  describe('verifyToken', () => {
    it('should return true when captcha is successful', async () => {
      mockPost.mockResolvedValue({
        data: { success: true, score: 0.9 },
      });

      const { CaptchaService } = await import('../../services/captcha.service');

      const result = await CaptchaService.verifyToken('valid_token');

      expect(result).toBe(true);
      expect(mockPost).toHaveBeenCalled();
    });

    it('should throw when token is missing', async () => {
      const { CaptchaService } = await import('../../services/captcha.service');

      await expect(CaptchaService.verifyToken('')).rejects.toThrow(
        'Token de seguridad faltante'
      );
    });

    it('should return false when captcha fails', async () => {
      mockPost.mockResolvedValue({
        data: { success: false, score: 0.1 },
      });

      const { CaptchaService } = await import('../../services/captcha.service');

      const result = await CaptchaService.verifyToken('invalid_token');

      expect(result).toBe(false);
    });

    it('should return false when score is below 0.5', async () => {
      mockPost.mockResolvedValue({
        data: { success: true, score: 0.3 },
      });

      const { CaptchaService } = await import('../../services/captcha.service');

      const result = await CaptchaService.verifyToken('low_score_token');

      expect(result).toBe(false);
    });

    it('should throw error when API call fails', async () => {
      mockPost.mockRejectedValue(new Error('Network error'));

      const { CaptchaService } = await import('../../services/captcha.service');

      await expect(CaptchaService.verifyToken('test_token')).rejects.toThrow(
        'No se pudo completar la validación de seguridad'
      );
    });
  });
});
