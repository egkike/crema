import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CREATOR_ID, USER_ID } from '../setup';
// eslint-disable-next-line import/order
import { ProductService } from '../../services/product.service';

vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    createProduct: vi.fn(),
    getProductById: vi.fn(),
  },
}));

vi.mock('../../repositories/payout_method.repository', () => ({
  payoutMethodRepository: {
    getByUserId: vi.fn(),
  },
}));

vi.mock('../../repositories/config.repository', () => ({
  configRepository: {
    getConfigsByCurrency: vi.fn(),
  },
}));

vi.mock('../../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    getCreatorPlanLimits: vi.fn(),
  },
}));

vi.mock('../../repositories/affiliate.repository', () => ({
  affiliateRepository: {
    addToPortfolio: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('slugify', () => ({
  default: vi.fn((str: string) => str.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { productRepository } from '../../repositories/product.repository';
import { payoutMethodRepository } from '../../repositories/payout_method.repository';
import { configRepository } from '../../repositories/config.repository';
import { subscriptionRepository } from '../../repositories/subscription.repository';
import { affiliateRepository } from '../../repositories/affiliate.repository';

describe('ProductService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    const validProductData = {
      title: 'Test Product',
      type: 'course',
      prices: [{ currency: 'ARS', amount: 10000 }],
      description: 'Test description',
      contentUrl: 'https://example.com/content',
      affiliate_commission_percent: 30,
    };

    it('should throw error if user has no payout methods', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([]);

      await expect(
        ProductService.create(CREATOR_ID, validProductData)
      ).rejects.toThrow('Debes configurar al menos un método de cobro');
    });

    it('should throw error if currency not in user methods', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'USD' },
      ]);
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_product_price_factor: 10,
        fixed_fee_low: 450,
      });

      await expect(
        ProductService.create(CREATOR_ID, validProductData)
      ).rejects.toThrow('No tienes método de cobro para: ARS');
    });

    it('should throw error if no prices defined', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);

      const dataWithoutPrices = { title: 'Test', type: 'course' };

      await expect(
        ProductService.create(CREATOR_ID, dataWithoutPrices as any)
      ).rejects.toThrow('al menos un precio definido');
    });

    it('should create product successfully', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_product_price_factor: 10,
        fixed_fee_low: 450,
        min_global_affiliate_commission: 5,
        fee_percent: 0.1,
      });
      vi.mocked(subscriptionRepository.getCreatorPlanLimits).mockResolvedValue(null);
      vi.mocked(productRepository.createProduct).mockResolvedValue({
        id: 'product-1',
        title: 'Test Product',
        slug: 'test-product-1234',
      } as any);

      const result = await ProductService.create(CREATOR_ID, validProductData);

      expect(result).toBeDefined();
      expect(productRepository.createProduct).toHaveBeenCalled();
    });
  });

  describe('validateMinimumPrice', () => {
    it('should throw if price is below minimum', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_product_price_factor: 10,
        fixed_fee_low: 450,
      });

      await expect(
        ProductService.validateMinimumPrice('ARS', 100)
      ).rejects.toThrow('es demasiado bajo');
    });

    it('should pass if price is above minimum', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_product_price_factor: 10,
        fixed_fee_low: 450,
      });

      await expect(
        ProductService.validateMinimumPrice('ARS', 10000)
      ).resolves.not.toThrow();
    });
  });

  describe('validateCommissionLimits', () => {
    it('should throw if commission below minimum', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_global_affiliate_commission: 5,
        fee_percent: 0.1,
      });
      vi.mocked(subscriptionRepository.getCreatorPlanLimits).mockResolvedValue(null);

      await expect(
        ProductService.validateCommissionLimits(CREATOR_ID, 3, 'ARS')
      ).rejects.toThrow('mínima permitida');
    });

    it('should throw if commission exceeds maximum', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_global_affiliate_commission: 5,
        fee_percent: 0.1,
      });
      vi.mocked(subscriptionRepository.getCreatorPlanLimits).mockResolvedValue(null);

      await expect(
        ProductService.validateCommissionLimits(CREATOR_ID, 90, 'ARS')
      ).rejects.toThrow('Comisión excesiva');
    });

    it('should pass with valid commission', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_global_affiliate_commission: 5,
        fee_percent: 0.1,
      });
      vi.mocked(subscriptionRepository.getCreatorPlanLimits).mockResolvedValue(null);

      await expect(
        ProductService.validateCommissionLimits(CREATOR_ID, 30, 'ARS')
      ).resolves.not.toThrow();
    });
  });

  describe('joinAffiliateProgram', () => {
    it('should throw if product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(
        ProductService.joinAffiliateProgram(USER_ID, 'product-1')
      ).rejects.toThrow('no existe');
    });

    it('should throw if currency mismatch', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue({
        id: 'product-1',
        prices: [{ currency: 'USD', amount: 100 }],
      } as any);
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { currency: 'ARS' },
      ]);

      await expect(
        ProductService.joinAffiliateProgram(USER_ID, 'product-1')
      ).rejects.toThrow('No puedes afiliarte');
    });

    it('should join successfully', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue({
        id: 'product-1',
        prices: [{ currency: 'ARS', amount: 100 }],
      } as any);
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { currency: 'ARS' },
      ]);
      vi.mocked(affiliateRepository.addToPortfolio).mockResolvedValue(true);

      const result = await ProductService.joinAffiliateProgram(USER_ID, 'product-1');

      expect(result).toBe(true);
    });
  });
});
