import { describe, it, expect, vi, beforeEach } from 'vitest';

import { USER_ID } from '../setup';
import { AuthService } from '../../services/auth.service';
import { userRepository } from '../../repositories/user.repository';
import { subscriptionRepository } from '../../repositories/subscription.repository';
import { configRepository } from '../../repositories/config.repository';
import { CaptchaService } from '../../services/captcha.service';
import { AppError } from '../../errors/AppError';

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    findByCredentials: vi.fn(),
    createUser: vi.fn(),
  },
}));

vi.mock('../../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    createInitialSubscription: vi.fn().mockResolvedValue({ id: 'sub-1' }),
  },
}));

vi.mock('../../repositories/config.repository', () => ({
  configRepository: {
    getUserLevels: vi.fn().mockResolvedValue({ USER: 1, CREATOR: 3, STAFF: 99 }),
    getSetting: vi.fn(),
  },
}));

vi.mock('../../services/captcha.service', () => ({
  CaptchaService: {
    verifyToken: vi.fn(),
  },
}));

vi.mock('../../services/email.service', () => ({
  EmailService: {
    sendPartnerWelcomeEmail: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerPartner', () => {
    const validUserData = {
      email: 'test@example.com',
      password: 'password123',
      fullname: 'Test User',
      level: 1,
    };

    it('should register a basic user successfully', async () => {
      vi.mocked(CaptchaService.verifyToken).mockResolvedValue(true);
      vi.mocked(userRepository.findByCredentials).mockResolvedValue(null);
      vi.mocked(userRepository.createUser).mockResolvedValue({
        id: USER_ID,
        email: 'test@example.com',
        fullname: 'Test User',
        level: 1,
        active: 0,
        verificationToken: 'token-123',
      } as any);

      const result = await AuthService.registerPartner(validUserData, 'valid-captcha');

      expect(result.email).toBe('test@example.com');
      expect(result.password).toBeUndefined();
      expect(result.verificationToken).toBeUndefined();
      expect(userRepository.createUser).toHaveBeenCalled();
    });

    it('should throw error if captcha is invalid', async () => {
      vi.mocked(CaptchaService.verifyToken).mockResolvedValue(false);

      await expect(
        AuthService.registerPartner(validUserData, 'invalid-captcha')
      ).rejects.toThrow('Validación de seguridad fallida');
    });

    it('should throw error if email already exists', async () => {
      vi.mocked(CaptchaService.verifyToken).mockResolvedValue(true);
      vi.mocked(userRepository.findByCredentials).mockResolvedValue({
        id: USER_ID,
        email: 'test@example.com',
      } as any);

      await expect(
        AuthService.registerPartner(validUserData, 'valid-captcha')
      ).rejects.toThrow('El email ya se encuentra registrado.');
    });

    it('should throw error if level is above allowed threshold', async () => {
      vi.mocked(CaptchaService.verifyToken).mockResolvedValue(true);

      const adminData = { ...validUserData, level: 99 };

      await expect(
        AuthService.registerPartner(adminData, 'valid-captcha')
      ).rejects.toThrow('Nivel de usuario no permitido para registro manual.');
    });

    it('should create subscription for creator level users', async () => {
      vi.mocked(CaptchaService.verifyToken).mockResolvedValue(true);
      vi.mocked(userRepository.findByCredentials).mockResolvedValue(null);
      vi.mocked(userRepository.createUser).mockResolvedValue({
        id: USER_ID,
        email: 'creator@example.com',
        fullname: 'Creator User',
        level: 3, // CREATOR
        active: 0,
        verificationToken: 'token-123',
      } as any);
      vi.mocked(configRepository.getSetting).mockResolvedValue('plan-pro');

      const creatorData = { ...validUserData, level: 3 };

      await AuthService.registerPartner(creatorData, 'valid-captcha');

      expect(subscriptionRepository.createInitialSubscription).toHaveBeenCalledWith(
        USER_ID,
        'plan-pro',
        'ARS'
      );
    });

    it('should not create subscription if default plan is not configured', async () => {
      vi.mocked(CaptchaService.verifyToken).mockResolvedValue(true);
      vi.mocked(userRepository.findByCredentials).mockResolvedValue(null);
      vi.mocked(userRepository.createUser).mockResolvedValue({
        id: USER_ID,
        email: 'creator@example.com',
        fullname: 'Creator User',
        level: 3,
        active: 0,
        verificationToken: 'token-123',
      } as any);
      vi.mocked(configRepository.getSetting).mockResolvedValue('');

      const creatorData = { ...validUserData, level: 3 };

      await AuthService.registerPartner(creatorData, 'valid-captcha');

      expect(subscriptionRepository.createInitialSubscription).not.toHaveBeenCalled();
    });

    it('should send welcome email after registration', async () => {
      vi.mocked(CaptchaService.verifyToken).mockResolvedValue(true);
      vi.mocked(userRepository.findByCredentials).mockResolvedValue(null);
      vi.mocked(userRepository.createUser).mockResolvedValue({
        id: USER_ID,
        email: 'test@example.com',
        fullname: 'Test User',
        level: 1,
        active: 0,
        verificationToken: 'token-123',
      } as any);

      await AuthService.registerPartner(validUserData, 'valid-captcha');

      const { EmailService } = await import('../../services/email.service');
      expect(EmailService.sendPartnerWelcomeEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Test User',
        1,
        'token-123'
      );
    });

    it('should register with default level when not provided', async () => {
      vi.mocked(CaptchaService.verifyToken).mockResolvedValue(true);
      vi.mocked(userRepository.findByCredentials).mockResolvedValue(null);
      vi.mocked(userRepository.createUser).mockResolvedValue({
        id: USER_ID,
        email: 'test@example.com',
        fullname: 'Test User',
        level: 1,
        active: 0,
        verificationToken: 'token-123',
      } as any);

      const dataWithoutLevel = { email: 'test@example.com', password: 'pass', fullname: 'Test' };

      const result = await AuthService.registerPartner(dataWithoutLevel, 'valid-captcha');

      expect(result).toBeDefined();
      expect(userRepository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ level: 1 })
      );
    });

    it('should propagate AppError from repository', async () => {
      vi.mocked(CaptchaService.verifyToken).mockResolvedValue(true);
      vi.mocked(userRepository.findByCredentials).mockResolvedValue(null);
      vi.mocked(userRepository.createUser).mockRejectedValue(
        new AppError('Database error', 500)
      );

      await expect(
        AuthService.registerPartner(validUserData, 'valid-captcha')
      ).rejects.toThrow('Database error');
    });
  });
});
