import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TwoFactorService } from '../../services/twoFactor.service';

describe('TwoFactorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSetup', () => {
    it('should generate secret, otpauth URI and backup codes', () => {
      const result = TwoFactorService.generateSetup('user@test.com');

      expect(result.secret).toBeDefined();
      expect(result.otpauth).toContain('otpauth://totp/');
      expect(result.backupCodes).toHaveLength(10);
      expect(result.backupCodes[0]).toHaveLength(8);
    });
  });

  describe('generateQRCode', () => {
    it('should generate QR code from otpauth URI', async () => {
      const result = await TwoFactorService.generateQRCode('otpauth://totp/Test:user@test.com?secret=TEST');

      expect(result).toContain('data:image/png;base64');
    });
  });

  describe('verifyToken', () => {
    it('should return true for valid token', () => {
      const result = TwoFactorService.verifyToken('123456', 'JBSWY3DPEHPK3PXP');

      expect(result).toBe(true);
    });
  });
});
