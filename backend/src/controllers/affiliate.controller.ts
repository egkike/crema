import { Request, Response, NextFunction } from 'express';

import { affiliateRepository } from '../repositories/affiliate.repository';
import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { config } from '../config/index';

export const getMyPortfolio = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    // 1. Obtener IDs de la tabla de unión
    const productIds = await affiliateRepository.getPortfolioProductIds(user.id);

    if (productIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 2. Hidratar TODO en una sola consulta SQL 🚀
    const products = await productRepository.getProductsByIds(productIds);

    const affIdentifier = user.affiliate_slug || user.id;

    // 3. Formatear para el cliente
    const data = products.map(p => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      commission: p.affiliate_commission_percent,
      prices: p.prices,
      link: `${config.frontendUrl}/p/${p.slug || p.id}?aff=${affIdentifier}`,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const removeFromPortfolio = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const { user } = req;

    if (!user) throw new AppError('Usuario no autenticado', 401);
    if (!productId) throw new AppError('ID de producto requerido', 400);

    if (typeof productId !== 'string') {
      throw new AppError('ID de producto no válido.', 400);
    }

    const removed = await affiliateRepository.removeFromPortfolio(user.id, productId);

    if (!removed) {
      throw new AppError('No se encontró el producto en tu portfolio.', 404);
    }

    logger.info({ userId: user.id, productId }, 'Producto eliminado del portfolio');

    res.status(200).json({
      success: true,
      message: 'Vínculo de afiliación eliminado correctamente.',
    });
  } catch (error) {
    next(error);
  }
};

export const affiliateController = {
  getMyPortfolio,
  removeFromPortfolio,
};
