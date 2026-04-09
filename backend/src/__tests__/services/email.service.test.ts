import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EmailService } from '../../services/email.service';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    }),
  },
}));

vi.mock('../config/index', () => ({
  config: {
    smtp: {
      host: 'smtp.test.com',
      port: 587,
      user: 'test@test.com',
      pass: 'password',
      from: 'noreply@crema.com',
    },
    frontendUrl: 'https://crema.com',
  },
}));

vi.mock('../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('EmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendBalanceReleasedEmail', () => {
    it('should send balance released email', async () => {
      const result = await EmailService.sendBalanceReleasedEmail(
        'user@test.com',
        'Test User',
        5000,
        'ARS'
      );

      expect(result).toBe(true);
    });

    it('should handle different currencies', async () => {
      const result = await EmailService.sendBalanceReleasedEmail(
        'user@test.com',
        'Test User',
        100,
        'USD'
      );

      expect(result).toBe(true);
    });

    it('should handle large amounts', async () => {
      const result = await EmailService.sendBalanceReleasedEmail(
        'user@test.com',
        'Test User',
        1000000,
        'ARS'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email', async () => {
      const result = await EmailService.sendVerificationEmail(
        'user@test.com',
        'Test User',
        'token-123'
      );

      expect(result).toBe(true);
    });

    it('should handle long tokens', async () => {
      const result = await EmailService.sendVerificationEmail(
        'user@test.com',
        'Test User',
        'very-long-token-string-with-many-characters'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendWelcomePurchaseEmail', () => {
    it('should send welcome purchase email', async () => {
      const result = await EmailService.sendWelcomePurchaseEmail(
        'user@test.com',
        'Test User',
        'tempPassword123',
        'Course Name'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendPurchaseConfirmationEmail', () => {
    it('should send purchase confirmation email', async () => {
      const result = await EmailService.sendPurchaseConfirmationEmail(
        'user@test.com',
        'Test User',
        'Product Name'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendPayoutMethodChangeEmail', () => {
    it('should send payout method change email', async () => {
      const result = await EmailService.sendPayoutMethodChangeEmail(
        'user@test.com',
        'Test User',
        'ARS',
        'https://crema.app/confirm'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendPayoutCompletedEmail', () => {
    it('should send payout completed email', async () => {
      const result = await EmailService.sendPayoutCompletedEmail(
        'user@test.com',
        'Test User',
        1000,
        'ARS',
        'Account ****1234',
        'TXN-123456'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendSecurityAlert', () => {
    it('should send security alert email', async () => {
      const result = await EmailService.sendSecurityAlert(
        'user@test.com',
        'Security Alert',
        'Suspicious activity detected'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendPartnerWelcomeEmail', () => {
    it('should send partner welcome email', async () => {
      const result = await EmailService.sendPartnerWelcomeEmail(
        'user@test.com',
        'Test User',
        3,
        'token-123'
      );

      expect(result).toBe(true);
    });

    it('should handle different affiliate levels', async () => {
      const result = await EmailService.sendPartnerWelcomeEmail(
        'user@test.com',
        'Test User',
        5,
        'token-456'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendResetPasswordEmail', () => {
    it('should send reset password email', async () => {
      const result = await EmailService.sendResetPasswordEmail(
        'user@test.com',
        'Test User',
        'reset-token'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendExpirationWarning', () => {
    it('should send expiration warning email', async () => {
      const result = await EmailService.sendExpirationWarning(
        'user@test.com',
        'Test User',
        'Pro',
        7
      );

      expect(result).toBe(true);
    });
  });

  describe('sendDowngradeNotification', () => {
    it('should send downgrade notification email', async () => {
      const result = await EmailService.sendDowngradeNotification(
        'user@test.com',
        'Test User'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendPayoutRequestedEmail', () => {
    it('should send payout requested email', async () => {
      const result = await EmailService.sendPayoutRequestedEmail(
        'user@test.com',
        'Test User',
        5000,
        'ARS',
        'Account ****1234'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendPayoutCancelledEmail', () => {
    it('should send payout cancelled email', async () => {
      const result = await EmailService.sendPayoutCancelledEmail(
        'user@test.com',
        'Test User',
        5000,
        'ARS'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendUpgradeSuccessEmail', () => {
    it('should send upgrade success email', async () => {
      const result = await EmailService.sendUpgradeSuccessEmail(
        'user@test.com',
        'Test User',
        3
      );

      expect(result).toBe(true);
    });
  });

  describe('sendSecurityNotification', () => {
    it('should send security notification email', async () => {
      const result = await EmailService.sendSecurityNotification(
        'user@test.com',
        'Your password was changed'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendGuaranteeInvalidatedEmail', () => {
    it('should send guarantee invalidated email', async () => {
      const result = await EmailService.sendGuaranteeInvalidatedEmail(
        'user@test.com',
        'Test User',
        'Product Name',
        'progress'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendPayoutRejectedEmail', () => {
    it('should send payout rejected email', async () => {
      const result = await EmailService.sendPayoutRejectedEmail(
        'user@test.com',
        'Test User',
        1000,
        'ARS',
        'Invalid account details'
      );

      expect(result).toBe(true);
    });
  });

  describe('sendSaleNotificationEmail', () => {
    it('should send sale notification email', async () => {
      const result = await EmailService.sendSaleNotificationEmail(
        'creator@test.com',
        'Product Name',
        5000,
        'ARS'
      );

      expect(result).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in names', async () => {
      const result = await EmailService.sendVerificationEmail(
        'user@test.com',
        'José García',
        'token'
      );

      expect(result).toBe(true);
    });

    it('should handle long product names', async () => {
      const result = await EmailService.sendPurchaseConfirmationEmail(
        'user@test.com',
        'Test User',
        'Very Long Product Name That Goes On And On'
      );

      expect(result).toBe(true);
    });
  });
});
