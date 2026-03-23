import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { aiCreditService } from '../../../services/ai/credits.service';
import { creditsRepository } from '../../../repositories/ai/credits.repository';
import { AppError } from '../../../errors/AppError';

// Mocks
vi.mock('../../../repositories/ai/credits.repository', () => ({
  creditsRepository: {
    getBalance: vi.fn(),
    create: vi.fn(),
    updateBalance: vi.fn(),
    addCredits: vi.fn(),
    useCredits: vi.fn(),
    getPackages: vi.fn(),
    getPackageById: vi.fn(),
    getTransactions: vi.fn(),
    getExpiredCredits: vi.fn(),
    expireCredits: vi.fn(),
  },
}));

vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Test constants
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const PACKAGE_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('AICreditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getBalance', () => {
    it('should return balance and expiresAt for user with credits', async () => {
      const mockCredit = {
        id: 'credit-1',
        user_id: USER_ID,
        balance: 100,
        expires_at: new Date('2027-12-31'),
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(creditsRepository.getBalance).mockResolvedValue(mockCredit);

      const result = await aiCreditService.getBalance(USER_ID);

      expect(result).toEqual({
        balance: 100,
        expiresAt: new Date('2027-12-31'),
      });
      expect(creditsRepository.getBalance).toHaveBeenCalledWith(USER_ID);
    });

    it('should return default values for user without credits', async () => {
      vi.mocked(creditsRepository.getBalance).mockResolvedValue(null);

      const result = await aiCreditService.getBalance(USER_ID);

      expect(result).toEqual({
        balance: 0,
        expiresAt: expect.any(Date),
      });
    });

    it('should return 0 balance for user with 0 credits', async () => {
      const mockCredit = {
        id: 'credit-1',
        user_id: USER_ID,
        balance: 0,
        expires_at: new Date('2027-12-31'),
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(creditsRepository.getBalance).mockResolvedValue(mockCredit);

      const result = await aiCreditService.getBalance(USER_ID);

      expect(result.balance).toBe(0);
    });
  });

  describe('ensureCreditRecord', () => {
    it('should return existing credit record', async () => {
      const mockCredit = {
        id: 'credit-1',
        user_id: USER_ID,
        balance: 50,
        expires_at: new Date('2027-12-31'),
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(creditsRepository.getBalance).mockResolvedValue(mockCredit);

      const result = await aiCreditService.ensureCreditRecord(USER_ID);

      expect(result).toEqual(mockCredit);
      expect(creditsRepository.create).not.toHaveBeenCalled();
    });

    it('should create new credit record if not exists', async () => {
      const mockCredit = {
        id: 'credit-1',
        user_id: USER_ID,
        balance: 0,
        expires_at: new Date('2027-12-31'),
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(creditsRepository.getBalance).mockResolvedValue(null);
      vi.mocked(creditsRepository.create).mockResolvedValue(mockCredit);

      const result = await aiCreditService.ensureCreditRecord(USER_ID);

      expect(result).toEqual(mockCredit);
      expect(creditsRepository.create).toHaveBeenCalledWith(USER_ID, 0);
    });
  });

  describe('hasSufficientCredits', () => {
    it('should return true when user has enough credits', async () => {
      vi.mocked(creditsRepository.getBalance).mockResolvedValue({
        id: 'credit-1',
        user_id: USER_ID,
        balance: 100,
        expires_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await aiCreditService.hasSufficientCredits(USER_ID, 50);

      expect(result).toBe(true);
    });

    it('should return false when user has insufficient credits', async () => {
      vi.mocked(creditsRepository.getBalance).mockResolvedValue({
        id: 'credit-1',
        user_id: USER_ID,
        balance: 30,
        expires_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await aiCreditService.hasSufficientCredits(USER_ID, 50);

      expect(result).toBe(false);
    });

    it('should return false when user has no credit record', async () => {
      vi.mocked(creditsRepository.getBalance).mockResolvedValue(null);

      const result = await aiCreditService.hasSufficientCredits(USER_ID, 50);

      expect(result).toBe(false);
    });
  });

  describe('useCredits', () => {
    it('should successfully use credits', async () => {
      vi.mocked(creditsRepository.getBalance).mockResolvedValueOnce(null); // ensureCreditRecord
      vi.mocked(creditsRepository.create).mockResolvedValue({ balance: 100 } as any);
      vi.mocked(creditsRepository.getBalance).mockResolvedValueOnce({
        balance: 100,
      } as any); // hasSufficientCredits
      vi.mocked(creditsRepository.useCredits).mockResolvedValue({
        id: 'credit-1',
        user_id: USER_ID,
        balance: 95,
        expires_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const result = await aiCreditService.useCredits(USER_ID, 5, 'Test usage');

      expect(result.balance).toBe(95);
    });

    it('should throw error when insufficient credits', async () => {
      vi.mocked(creditsRepository.getBalance).mockResolvedValue(null);
      vi.mocked(creditsRepository.create).mockResolvedValue({ balance: 0 } as any);
      vi.mocked(creditsRepository.getBalance).mockResolvedValue({
        balance: 0,
      } as any);

      await expect(
        aiCreditService.useCredits(USER_ID, 10, 'Test usage')
      ).rejects.toThrow(AppError);

      await expect(
        aiCreditService.useCredits(USER_ID, 10, 'Test usage')
      ).rejects.toThrow('Insufficient credits');
    });
  });

  describe('addCredits', () => {
    it('should successfully add credits to user', async () => {
      const mockCredit = {
        id: 'credit-1',
        user_id: USER_ID,
        balance: 500,
        expires_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(creditsRepository.addCredits).mockResolvedValue(mockCredit as any);

      const result = await aiCreditService.addCredits(USER_ID, 500, 'Test purchase');

      expect(result.balance).toBe(500);
    });

    it('should throw error when adding credits fails', async () => {
      vi.mocked(creditsRepository.addCredits).mockRejectedValue(new Error('DB error'));

      await expect(
        aiCreditService.addCredits(USER_ID, 500, 'Test')
      ).rejects.toThrow('Failed to add credits');
    });
  });

  describe('purchasePackage', () => {
    it('should successfully purchase a credit package', async () => {
      const mockPackage = {
        id: PACKAGE_ID,
        name: 'Starter',
        credits: 500,
        price_usd: 2.0,
        price_ars: 2000,
        is_active: true,
        created_at: new Date(),
      };

      const mockCredit = {
        id: 'credit-1',
        user_id: USER_ID,
        balance: 500,
        expires_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockTransaction = {
        id: 'tx-1',
        user_id: USER_ID,
        amount: 500,
        type: 'purchase' as const,
        description: 'Purchase: Starter (500 credits)',
        created_at: new Date(),
      };

      vi.mocked(creditsRepository.getPackageById).mockResolvedValue(mockPackage as any);
      vi.mocked(creditsRepository.addCredits).mockResolvedValue(mockCredit as any);
      vi.mocked(creditsRepository.getTransactions).mockResolvedValue({
        transactions: [mockTransaction as any],
        total: 1,
      });

      const result = await aiCreditService.purchasePackage(USER_ID, PACKAGE_ID);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(500);
      expect(result.transaction).toEqual(mockTransaction);
    });

    it('should throw error when package not found', async () => {
      vi.mocked(creditsRepository.getPackageById).mockResolvedValue(null);

      await expect(
        aiCreditService.purchasePackage(USER_ID, 'invalid-id')
      ).rejects.toThrow('Credit package not found');
    });

    it('should throw error when package is inactive', async () => {
      vi.mocked(creditsRepository.getPackageById).mockResolvedValue({
        id: PACKAGE_ID,
        name: 'Starter',
        credits: 500,
        price_usd: 2.0,
        is_active: false,
        created_at: new Date(),
      } as any);

      await expect(
        aiCreditService.purchasePackage(USER_ID, PACKAGE_ID)
      ).rejects.toThrow('This credit package is not available');
    });
  });

  describe('getPackages', () => {
    it('should return active packages', async () => {
      const mockPackages = [
        { id: '1', name: 'Starter', credits: 500, is_active: true },
        { id: '2', name: 'Pro', credits: 2000, is_active: true },
      ];

      vi.mocked(creditsRepository.getPackages).mockResolvedValue(mockPackages as any);

      const result = await aiCreditService.getPackages();

      expect(result).toEqual(mockPackages);
      expect(creditsRepository.getPackages).toHaveBeenCalledWith(false);
    });
  });

  describe('getOperationCost', () => {
    it('should return correct cost for search operation', () => {
      const cost = aiCreditService.getOperationCost('search');
      expect(cost).toBe(1);
    });

    it('should return correct cost for chat operation', () => {
      const cost = aiCreditService.getOperationCost('chat');
      expect(cost).toBe(5);
    });

    it('should return correct cost for generate_insight operation', () => {
      const cost = aiCreditService.getOperationCost('generate_insight');
      expect(cost).toBe(10);
    });
  });

  describe('expireOldCredits', () => {
    it('should return 0 when no expired credits', async () => {
      vi.mocked(creditsRepository.getExpiredCredits).mockResolvedValue([]);

      const result = await aiCreditService.expireOldCredits();

      expect(result).toBe(0);
    });

    it('should expire multiple credits', async () => {
      const expiredCredits = [
        { user_id: USER_ID },
        { user_id: 'user-2' },
        { user_id: 'user-3' },
      ];

      vi.mocked(creditsRepository.getExpiredCredits).mockResolvedValue(expiredCredits as any);
      vi.mocked(creditsRepository.expireCredits).mockResolvedValue();

      const result = await aiCreditService.expireOldCredits();

      expect(result).toBe(3);
      expect(creditsRepository.expireCredits).toHaveBeenCalledTimes(3);
    });
  });
});