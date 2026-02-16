import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import slugify from 'slugify';

import { productRepository, ProductInput } from '../repositories/product.repository';
import { ProductService } from '../services/product.service';
import { AppError } from '../errors/AppError';
import { createProductSchema } from '../schemas/products.schema';
import logger from '../utils/logger';
import { config } from '../config/index';

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const validatedData = createProductSchema.parse(req.body);

    const requestedComm = validatedData.commissionPercent ?? 0;
    await ProductService.validateCommissionLimits(user.id, requestedComm);

    const baseSlug = slugify(validatedData.title, { lower: true, strict: true });
    const uniqueSlug = `${baseSlug}-${Math.floor(100 + Math.random() * 899)}`;

    const productInput: ProductInput = {
      creatorId: user.id,
      title: validatedData.title,
      slug: uniqueSlug,
      type: validatedData.type,
      prices: validatedData.prices,
      description: validatedData.description ?? undefined,
      contentUrl: validatedData.contentUrl ?? undefined,
      commissionPercent: validatedData.commissionPercent ?? undefined,
      status: validatedData.status ?? undefined,
      sizeBytes: validatedData.sizeBytes ?? undefined,
      guaranteeDays: validatedData.guaranteeDays ?? undefined,
    };

    logger.info({ creatorId: user.id, slug: uniqueSlug }, 'Creando nuevo producto');
    const product = await productRepository.createProduct(productInput);

    res.status(201).json({ success: true, data: product });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map(issue => issue.message).join('. ');
      return next(new AppError(`Error de validación: ${message}`, 400));
    }
    next(error);
  }
};

export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;

    // Type Guard: Si no es string, lanzamos error
    if (typeof productId !== 'string') {
      throw new AppError('ID de producto no válido.', 400);
    }

    const { user } = req;
    const product = await productRepository.getProductByIdOrSlug(productId);
    if (!product) throw new AppError('Producto no encontrado', 404);

    const isOwner = user && product.creator_id === user.id;
    const isAdmin = user && user.level >= 10;

    const productData = {
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      prices: product.prices,
      type: product.type,
      status: product.status,
      ...((isOwner || isAdmin) && { contentUrl: product.content_url }),
    };

    res.status(200).json({ success: true, data: productData });
  } catch (error) {
    next(error);
  }
};

export const getMyProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req; // LIMPIO
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const products = await productRepository.getProductsByCreator(user.id);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

export const getAffiliateMarketplace = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req; // LIMPIO
    const products = await productRepository.getPublicProducts();

    // Ahora TS reconoce affiliate_slug gracias al .d.ts
    const affIdentifier = user?.affiliate_slug || user?.id || 'guest';

    const data = products.map(p => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      commission: p.affiliate_commission_percent,
      link: `${config.frontendUrl}/p/${p.slug || p.id}?aff=${affIdentifier}`,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const productController = {
  createProduct,
  getMyProducts,
  getProductById,
  getAffiliateMarketplace,
};
