import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CREATOR_ID, USER_ID } from '../setup';
 
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

    it('should throw if prices array is empty', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);

      const dataWithEmptyPrices = { 
        title: 'Test', 
        type: 'course', 
        prices: [] 
      };

      await expect(
        ProductService.create(CREATOR_ID, dataWithEmptyPrices as any)
      ).rejects.toThrow('al menos un precio definido');
    });

    it('should throw if product has no content (no sizeBytes, no contentUrl, no modules)', async () => {
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

      const dataWithoutContent = { 
        title: 'Test', 
        type: 'ebook',
        prices: [{ currency: 'ARS', amount: 10000 }],
        affiliate_commission_percent: 30, // Valid commission to pass validation
      };

      await expect(
        ProductService.create(CREATOR_ID, dataWithoutContent as any)
      ).rejects.toThrow('no tiene contenido');
    });

    it('should accept product with contentUrl even if sizeBytes is 0', async () => {
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
        title: 'Test',
        slug: 'test-1234',
      } as any);

      const dataWithContentUrl = { 
        title: 'Test', 
        type: 'ebook',
        prices: [{ currency: 'ARS', amount: 10000 }],
        contentUrl: 'https://example.com/file.pdf',
        affiliate_commission_percent: 30,
      };

      const result = await ProductService.create(CREATOR_ID, dataWithContentUrl as any);

      expect(result).toBeDefined();
      expect(productRepository.createProduct).toHaveBeenCalled();
    });

    it('should throw duplicate key error when slug collision', async () => {
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
      vi.mocked(productRepository.createProduct).mockRejectedValue({
        code: '23505',
        message: 'duplicate key',
      });

      await expect(
        ProductService.create(CREATOR_ID, validProductData)
      ).rejects.toThrow('Ya existe un producto con un título muy similar');
    });

    it('should handle multiple prices with different currencies', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
        { id: 'method-2', currency: 'USD' },
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
        title: 'Test',
        slug: 'test-1234',
      } as any);

      const dataWithMultiplePrices = { 
        title: 'Test', 
        type: 'course',
        prices: [
          { currency: 'ARS', amount: 10000 },
          { currency: 'USD', amount: 5000 }, // Higher amount to pass minimum
        ],
        contentUrl: 'https://example.com/content',
        affiliate_commission_percent: 30,
      };

      const result = await ProductService.create(CREATOR_ID, dataWithMultiplePrices as any);

      expect(result).toBeDefined();
    });

    it('should use structured content for courses with modules', async () => {
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
        title: 'Test Course',
        slug: 'test-course-1234',
      } as any);

      const dataWithModules = { 
        title: 'Test Course', 
        type: 'course',
        prices: [{ currency: 'ARS', amount: 10000 }],
        affiliate_commission_percent: 30,
        modules: [
          { title: 'Module 1', content: '...' },
          { title: 'Module 2', content: '...' },
        ],
      };

      const result = await ProductService.create(CREATOR_ID, dataWithModules as any);

      expect(result).toBeDefined();
      expect(productRepository.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          hasStructuredContent: true,
          modules: dataWithModules.modules,
        })
      );
    });

    it('should apply custom_fee_percent from subscription plan', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_product_price_factor: 10,
        fixed_fee_low: 450,
        min_global_affiliate_commission: 5,
        fee_percent: 0.1,
      });
      vi.mocked(subscriptionRepository.getCreatorPlanLimits).mockResolvedValue({
        id: 'plan-pro',
        name: 'Pro',
        features: {
          custom_fee_percent: 0.05, // 5% instead of 10%
        },
      });
      vi.mocked(productRepository.createProduct).mockResolvedValue({
        id: 'product-1',
        title: 'Test',
        slug: 'test-1234',
      } as any);

      // This should work because with 5% fee, the max commission is higher
      const result = await ProductService.create(CREATOR_ID, {
        ...validProductData,
        affiliate_commission_percent: 80, // 80% should work with 5% fee
      });

      expect(result).toBeDefined();
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

    it('should use default values when config is missing', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({});

      await expect(
        ProductService.validateMinimumPrice('ARS', 10000)
      ).resolves.not.toThrow();
    });

    it('should throw for USD with low amount', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_product_price_factor: 10,
        fixed_fee_low: 5,
      });

      await expect(
        ProductService.validateMinimumPrice('USD', 10)
      ).rejects.toThrow('es demasiado bajo');
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

    it('should use default min_global_affiliate_commission when not in config', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({});
      vi.mocked(subscriptionRepository.getCreatorPlanLimits).mockResolvedValue(null);

      await expect(
        ProductService.validateCommissionLimits(CREATOR_ID, 3, 'ARS')
      ).rejects.toThrow('mínima permitida');
    });

    it('should use default fee_percent when not in config', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_global_affiliate_commission: 5,
      });
      vi.mocked(subscriptionRepository.getCreatorPlanLimits).mockResolvedValue(null);

      // fee_percent defaults to 10%, so max commission is 85%
      // 86% should exceed the limit
      await expect(
        ProductService.validateCommissionLimits(CREATOR_ID, 86, 'ARS')
      ).rejects.toThrow('Comisión excesiva');
    });

    it('should apply custom_fee_percent from subscription plan', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_global_affiliate_commission: 5,
        fee_percent: 0.1,
      });
      vi.mocked(subscriptionRepository.getCreatorPlanLimits).mockResolvedValue({
        id: 'plan-pro',
        name: 'Pro',
        features: {
          custom_fee_percent: 0.05,
        },
      });

      // With 5% platform fee + 5% creator margin = 90% max commission
      // 91% should exceed the limit and throw
      await expect(
        ProductService.validateCommissionLimits(CREATOR_ID, 91, 'ARS')
      ).rejects.toThrow('Comisión excesiva');

      // But 85% should pass with 5% fee
      await expect(
        ProductService.validateCommissionLimits(CREATOR_ID, 85, 'ARS')
      ).resolves.not.toThrow();
    });

    it('should throw generic error when validation fails unexpectedly', async () => {
      vi.mocked(configRepository.getConfigsByCurrency).mockRejectedValue(
        new Error('Database connection error')
      );

      await expect(
        ProductService.validateCommissionLimits(CREATOR_ID, 30, 'ARS')
      ).rejects.toThrow('No se pudieron validar los límites de comisión');
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
