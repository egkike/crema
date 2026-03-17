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
  });
});
