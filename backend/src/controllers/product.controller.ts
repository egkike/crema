import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { productRepository, ProductInput } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import { createProductSchema } from '../schemas/products';
import logger from '../utils/logger';

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const validatedData = createProductSchema.parse(req.body);

    // Spread condicional para evitar el error de 'undefined' con exactOptionalPropertyTypes
    const productInput: ProductInput = {
      creatorId: user.id,
      title: validatedData.title,
      type: validatedData.type,
      prices: validatedData.prices,
      commissionPercent: validatedData.commissionPercent ?? 0,
      status: validatedData.status ?? 'published',
      ...(validatedData.description && { description: validatedData.description }),
      ...(validatedData.contentUrl && { contentUrl: validatedData.contentUrl }),
    };

    logger.info({ creatorId: user.id, title: validatedData.title }, 'Creando nuevo producto');
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
    // SOLUCIÓN AL ERROR DE TIPO: Validamos que productId sea string
    const { productId } = req.params;
    if (typeof productId !== 'string') {
      throw new AppError('ID de producto no válido', 400);
    }

    const user = (req as any).user;

    const product = await productRepository.getProductById(productId);
    if (!product) throw new AppError('Producto no encontrado', 404);

    // Lógica de privacidad: Ocultar content_url en la vista pública
    const isOwner = user && product.creator_id === user.id;
    const isAdmin = user && user.level >= 99;

    // Clonamos para no mutar el objeto original si viene de una caché
    const productData = { ...product };

    if (!isOwner && !isAdmin) {
      delete (productData as any).content_url;
      delete (productData as any).contentUrl;
    }

    res.status(200).json({ success: true, data: productData });
  } catch (error) {
    next(error);
  }
};

export const getMyProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const products = await productRepository.getProductsByCreator(user.id);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

// Exportamos los métodos
export const productController = {
  createProduct,
  getMyProducts,
  getProductById,
};
