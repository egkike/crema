import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock repositories
vi.mock('../../repositories/affiliate.repository', () => ({
  affiliateRepository: {
    getPortfolioProductIds: vi.fn(),
    removeFromPortfolio: vi.fn(),
  },
}));

vi.mock('../../repositories/product.repository', () => ({
  productRepository: { getProductsByIds: vi.fn() },
}));

vi.mock('../../config/index', () => ({
  config: { frontendUrl: 'https://crema.test' },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../errors/AppError', () => ({
  AppError: class extends Error {
    public statusCode: number;
    public isOperational: boolean;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = true;
    }
  },
}));

describe('AffiliateController', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { user: null, body: {}, params: {} };
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    mockNext = vi.fn();
  });

  describe('getMyPortfolio', () => {
    it('should throw 401 when not authenticated', async () => {
      const { getMyPortfolio } = await import('../../controllers/affiliate.controller');

      mockReq.user = null;

      await getMyPortfolio(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('should return empty array when no products', async () => {
      const affRepo = await import('../../repositories/affiliate.repository');
      (affRepo.affiliateRepository.getPortfolioProductIds as any).mockResolvedValue([]);

      const { getMyPortfolio } = await import('../../controllers/affiliate.controller');

      mockReq.user = { id: 'user-1' };

      await getMyPortfolio(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: [] })
      );
    });

    it('should return products when portfolio exists', async () => {
      const affRepo = await import('../../repositories/affiliate.repository');
      const prodRepo = await import('../../repositories/product.repository');

      (affRepo.affiliateRepository.getPortfolioProductIds as any).mockResolvedValue(['prod-1']);
      (prodRepo.productRepository.getProductsByIds as any).mockResolvedValue([
        { id: 'prod-1', title: 'Product 1', slug: 'product-1', affiliate_commission_percent: 10, prices: { ARS: 1000 } }
      ]);

      const { getMyPortfolio } = await import('../../controllers/affiliate.controller');

      mockReq.user = { id: 'user-1', affiliate_slug: 'my-slug' };

      await getMyPortfolio(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([expect.objectContaining({ id: 'prod-1' })]),
        })
      );
    });
  });

  describe('removeFromPortfolio', () => {
    it('should throw 401 when not authenticated', async () => {
      const { removeFromPortfolio } = await import('../../controllers/affiliate.controller');

      mockReq.user = null;

      await removeFromPortfolio(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('should throw 400 when productId missing', async () => {
      const { removeFromPortfolio } = await import('../../controllers/affiliate.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.params = {};

      await removeFromPortfolio(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    it('should remove product from portfolio', async () => {
      const affRepo = await import('../../repositories/affiliate.repository');
      (affRepo.affiliateRepository.removeFromPortfolio as any).mockResolvedValue(true);

      const { removeFromPortfolio } = await import('../../controllers/affiliate.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.params = { productId: 'prod-1' };

      await removeFromPortfolio(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should throw 404 when product not in portfolio', async () => {
      const affRepo = await import('../../repositories/affiliate.repository');
      (affRepo.affiliateRepository.removeFromPortfolio as any).mockResolvedValue(false);

      const { removeFromPortfolio } = await import('../../controllers/affiliate.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.params = { productId: 'prod-1' };

      await removeFromPortfolio(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });
});
